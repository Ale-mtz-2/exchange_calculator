import 'dotenv/config';

import path from 'node:path';

import type { ExchangeGroupCode, ExchangeSubgroupCode } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { inferGroupCodeFromText } from '../services/groupCodeMapper.js';
import { safeSchema } from '../utils/sql.js';
import {
  bestGuideTokenMatch,
  ensureDirectory,
  type ExternalSmaeFood,
  fetchExternalSmaeFoods,
  inferPortionUnit,
  loadGuideTokens,
  loadMxMappings,
  mandatorySubgroupGroupCodes,
  mapExternalAliasToBucket,
  normalizeText,
  round2,
  sourceNameIsSmae,
  writeCsv,
} from './smaeFoodCurationUtils.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

type FoodAuditBaseRow = {
  food_id: number;
  name: string;
  food_group_id: number | null;
  food_subgroup_id: number | null;
  food_group_name: string | null;
  food_subgroup_name: string | null;
  base_serving_qty: number | null;
  base_serving_unit: string | null;
  override_group_id: number | null;
  override_subgroup_id: number | null;
  override_serving_qty: number | null;
  override_serving_unit: string | null;
  override_is_active: boolean | null;
  canonical_data_source_name: string | null;
  canonical_data_source_id: number | null;
  canonical_protein_g: number | null;
  canonical_carbs_g: number | null;
  canonical_fat_g: number | null;
};

type ServingCandidateRow = {
  food_id: number;
  serving_qty: number;
  unit_name: string | null;
  is_high_conf: number;
  is_generic: number;
};

type Recommendation = {
  recommendedGroupId: number | null;
  recommendedSubgroupId: number | null;
  recommendedServingQty: number | null;
  recommendedServingUnit: string | null;
  evidenceSource: 'serving_units_high_conf' | 'external_smae' | 'manual_example' | 'manual_override_required';
  confidence: 'high' | 'medium' | 'low';
  action: 'update' | 'keep' | 'exclude_runtime' | 'review_required';
  notes: string;
};

const LEGUME_HINTS = [
  'frijol',
  'lenteja',
  'garbanzo',
  'haba',
  'alubia',
  'edamame',
  'soya',
  'soja',
  'chicharo',
];

const MILK_HINTS = [
  'leche',
  'yogur',
  'yogurt',
  'kefir',
  'jocoque',
  'yakult',
];

const SUGAR_HINTS = [
  'azucar',
  'miel',
  'mermelada',
  'jarabe',
  'caramelo',
  'cajeta',
  'mazapan',
  'palanqueta',
  'jalea',
  'chocolate',
  'piloncillo',
];

const FAT_HINTS = [
  'aceite',
  'mantequilla',
  'margarina',
  'mayonesa',
  'aguacate',
  'nuez',
  'almendra',
  'cacahuate',
  'aceituna',
  'semilla',
];

const PROTEIN_HINTS = [
  'pollo',
  'res',
  'cerdo',
  'atun',
  'pescado',
  'huevo',
  'pavo',
  'queso',
  'salchicha',
  'chorizo',
  'jamon',
];

const VEGETABLE_HINTS = [
  'chile',
  'jitomate',
  'tomate',
  'nopal',
  'verdolaga',
  'romerito',
  'acelga',
  'espinaca',
  'brocoli',
  'coliflor',
  'calabaza',
  'pepino',
  'chayote',
  'lechuga',
  'jicama',
];

const inferGroupByHeuristics = (
  foodName: string,
  _protein: number,
  _carbs: number,
  _fat: number,
): ExchangeGroupCode | null => {
  const normalizedName = normalizeText(foodName);
  const containsAny = (keywords: string[]): boolean =>
    keywords.some((keyword) => normalizedName.includes(keyword));

  if (containsAny(LEGUME_HINTS)) return 'legume';
  if (containsAny(MILK_HINTS)) return 'milk';

  const hasSugarKeyword = containsAny(SUGAR_HINTS);
  const hasCerealKeyword =
    normalizedName.includes('cereal') ||
    normalizedName.includes('pan') ||
    normalizedName.includes('arroz') ||
    normalizedName.includes('pasta') ||
    normalizedName.includes('harina') ||
    normalizedName.includes('maicena') ||
    normalizedName.includes('galleta') ||
    normalizedName.includes('wafle') ||
    normalizedName.includes('hot cake') ||
    normalizedName.includes('tostada');
  const saysSugarFree = normalizedName.includes('sin azucar');

  if (hasSugarKeyword && !hasCerealKeyword && !saysSugarFree) return 'sugar';
  if (containsAny(FAT_HINTS)) return 'fat';
  if (containsAny(PROTEIN_HINTS)) return 'protein';
  if (containsAny(VEGETABLE_HINTS)) return 'vegetable';

  return null;
};

const classifyCerealSubgroup = (fat: number): ExchangeSubgroupCode =>
  (fat <= 1 ? 'cereal_sin_grasa' : 'cereal_con_grasa');

const classifyAoaSubgroup = (protein: number, fat: number): ExchangeSubgroupCode => {
  const ratio = (fat / Math.max(protein, 0.1)) * 7;
  if (ratio < 1.5) return 'aoa_muy_bajo_grasa';
  if (ratio < 4) return 'aoa_bajo_grasa';
  if (ratio < 7) return 'aoa_moderado_grasa';
  return 'aoa_alto_grasa';
};

const classifyMilkSubgroup = (carbs: number, fat: number): ExchangeSubgroupCode => {
  if (carbs > 20) return 'leche_con_azucar';
  if (fat <= 2) return 'leche_descremada';
  if (fat <= 5) return 'leche_semidescremada';
  return 'leche_entera';
};

const classifySugarSubgroup = (fat: number): ExchangeSubgroupCode =>
  (fat <= 1 ? 'azucar_sin_grasa' : 'azucar_con_grasa');

const classifyFatSubgroup = (protein: number): ExchangeSubgroupCode =>
  (protein >= 1.5 ? 'grasa_con_proteina' : 'grasa_sin_proteina');

const inferRequiredSubgroup = (
  groupCode: ExchangeGroupCode,
  foodName: string,
  protein: number,
  carbs: number,
  fat: number,
): ExchangeSubgroupCode | null => {
  if (!mandatorySubgroupGroupCodes.has(groupCode)) return null;

  if (groupCode === 'carb') return classifyCerealSubgroup(fat);
  if (groupCode === 'protein') {
    const normalizedName = normalizeText(foodName);
    const looksLegume =
      LEGUME_HINTS.some((keyword) => normalizedName.includes(keyword)) ||
      (protein >= 6 && carbs >= 10 && fat <= 6);
    if (looksLegume) return null;
    return classifyAoaSubgroup(protein, fat);
  }
  if (groupCode === 'milk') return classifyMilkSubgroup(carbs, fat);
  if (groupCode === 'fat') return classifyFatSubgroup(protein);
  if (groupCode === 'sugar') return classifySugarSubgroup(fat);

  return null;
};

const chooseServing = (
  highConfServing: ServingCandidateRow | undefined,
  externalQty: number | null,
  groupCode: ExchangeGroupCode,
  foodName: string,
  externalUnits: string,
  guideMatchToken: string | null,
  fallbackQty: number | null,
  fallbackUnit: string | null,
): Pick<Recommendation, 'recommendedServingQty' | 'recommendedServingUnit' | 'evidenceSource' | 'confidence' | 'notes'> => {
  if (highConfServing && highConfServing.serving_qty > 0) {
    return {
      recommendedServingQty: round2(highConfServing.serving_qty),
      recommendedServingUnit: inferPortionUnit(groupCode, foodName, highConfServing.unit_name ?? externalUnits),
      evidenceSource: 'serving_units_high_conf',
      confidence: 'high',
      notes: 'Resolved from nutrition.serving_units high-confidence exchange unit',
    };
  }

  if (externalQty !== null && externalQty > 0) {
    return {
      recommendedServingQty: round2(externalQty),
      recommendedServingUnit: inferPortionUnit(groupCode, foodName, externalUnits),
      evidenceSource: 'external_smae',
      confidence: 'medium',
      notes: 'Resolved from external SMAE list_food equivalent quantity',
    };
  }

  if (guideMatchToken) {
    return {
      recommendedServingQty: fallbackQty,
      recommendedServingUnit: fallbackUnit,
      evidenceSource: 'manual_example',
      confidence: 'low',
      notes: `Guide token match: ${guideMatchToken}`,
    };
  }

  return {
    recommendedServingQty: fallbackQty,
    recommendedServingUnit: fallbackUnit,
    evidenceSource: 'manual_override_required',
    confidence: 'low',
    notes: 'No high-confidence serving evidence available; requires manual review',
  };
};

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), '..', '..');
  const tmpDir = path.join(root, 'apps', 'api', 'tmp');
  const guidePath = path.join(root, 'ejemplos_grupos_smae_am_fitness.md');

  await ensureDirectory(tmpDir);

  const [mxMappings, externalFoods, guideTokens] = await Promise.all([
    loadMxMappings(),
    fetchExternalSmaeFoods(),
    loadGuideTokens(guidePath),
  ]);

  const foodRowsResult = await nutritionPool.query<FoodAuditBaseRow>(
    `
      WITH latest_nutri AS (
        SELECT DISTINCT ON (fnv.food_id)
          fnv.food_id,
          fnv.data_source_id,
          ds.name AS data_source_name,
          fnv.protein_g::float8 AS protein_g,
          fnv.carbs_g::float8 AS carbs_g,
          fnv.fat_g::float8 AS fat_g
        FROM ${nutritionSchema}.food_nutrition_values fnv
        LEFT JOIN ${nutritionSchema}.data_sources ds ON ds.id = fnv.data_source_id
        LEFT JOIN ${appSchema}.exchange_source_priorities esp
          ON esp.system_id = 'mx_smae'
         AND esp.data_source_id = fnv.data_source_id
         AND esp.is_active = true
        WHERE fnv.deleted_at IS NULL
        ORDER BY fnv.food_id,
          CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
          COALESCE(esp.priority, 1000),
          fnv.id DESC
      )
      SELECT
        f.id AS food_id,
        f.name,
        f.exchange_group_id AS food_group_id,
        f.exchange_subgroup_id AS food_subgroup_id,
        eg.name AS food_group_name,
        es.name AS food_subgroup_name,
        CASE WHEN f.base_serving_size IS NOT NULL AND f.base_serving_size > 0 THEN f.base_serving_size::float8 ELSE NULL END AS base_serving_qty,
        NULLIF(BTRIM(f.base_unit), '') AS base_serving_unit,
        feo.group_id AS override_group_id,
        feo.subgroup_id AS override_subgroup_id,
        CASE WHEN feo.equivalent_portion_qty IS NOT NULL AND feo.equivalent_portion_qty > 0 THEN feo.equivalent_portion_qty::float8 ELSE NULL END AS override_serving_qty,
        NULLIF(BTRIM(feo.portion_unit), '') AS override_serving_unit,
        feo.is_active AS override_is_active,
        ln.data_source_name AS canonical_data_source_name,
        ln.data_source_id AS canonical_data_source_id,
        ln.protein_g AS canonical_protein_g,
        ln.carbs_g AS canonical_carbs_g,
        ln.fat_g AS canonical_fat_g
      FROM ${nutritionSchema}.foods f
      JOIN ${nutritionSchema}.exchange_groups eg ON eg.id = f.exchange_group_id
      LEFT JOIN ${nutritionSchema}.exchange_subgroups es ON es.id = f.exchange_subgroup_id
      LEFT JOIN ${appSchema}.food_exchange_overrides feo
        ON feo.food_id = f.id
       AND feo.system_id = 'mx_smae'
      LEFT JOIN latest_nutri ln ON ln.food_id = f.id
      WHERE eg.system_id = $1
      ORDER BY f.id ASC;
    `,
    [mxMappings.nutritionSystemId],
  );

  const servingCandidatesResult = await nutritionPool.query<ServingCandidateRow>(
    `
      WITH serving_candidates AS (
        SELECT
          su.food_id,
          su.gram_equivalent::float8 AS serving_qty,
          NULLIF(BTRIM(su.unit_name), '') AS unit_name,
          CASE
            WHEN su.gram_equivalent <> 100 THEN 1
            WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') ~ '(pieza|rebanad|taza|cucharad|envase|vaso|unidad)' THEN 1
            ELSE 0
          END AS is_high_conf,
          CASE
            WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%porcion equivalente%' THEN 1
            WHEN translate(lower(COALESCE(su.unit_name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun') LIKE '%porcion estandar%' THEN 1
            ELSE 0
          END AS is_generic,
          su.id
        FROM ${nutritionSchema}.serving_units su
        WHERE su.is_exchange_unit = true
          AND su.gram_equivalent IS NOT NULL
          AND su.gram_equivalent > 0
      )
      SELECT DISTINCT ON (food_id)
        food_id,
        serving_qty,
        unit_name,
        is_high_conf,
        is_generic
      FROM serving_candidates
      ORDER BY food_id,
        is_high_conf DESC,
        CASE WHEN is_high_conf = 1 AND is_generic = 0 THEN 0 ELSE 1 END,
        CASE WHEN serving_qty <> 100 THEN 0 ELSE 1 END,
        id ASC;
    `,
  );

  const servingByFoodId = new Map<number, ServingCandidateRow>(
    servingCandidatesResult.rows.map((row) => [row.food_id, row]),
  );

  const externalByNormalizedName = new Map<string, ExternalSmaeFood>();
  for (const row of externalFoods) {
    const existing = externalByNormalizedName.get(row.normalizedName);
    if (!existing) {
      externalByNormalizedName.set(row.normalizedName, row);
      continue;
    }

    const existingHasEqui = existing.equiQty !== null;
    const rowHasEqui = row.equiQty !== null;
    if (!existingHasEqui && rowHasEqui) {
      externalByNormalizedName.set(row.normalizedName, row);
    }
  }

  const groupCodeById = new Map<number, ExchangeGroupCode>();
  for (const [code, id] of mxMappings.groupIdByCode.entries()) {
    groupCodeById.set(id, code);
  }

  const subgroupCodeById = new Map<number, ExchangeSubgroupCode>();
  for (const [code, id] of mxMappings.subgroupIdByCode.entries()) {
    subgroupCodeById.set(id, code);
  }

  const existingNormalizedNames = new Set<string>();
  const auditRows: Record<string, string>[] = [];
  const conflictRows: Record<string, string>[] = [];

  for (const row of foodRowsResult.rows) {
    const normalizedName = normalizeText(row.name);
    existingNormalizedNames.add(normalizedName);

    const currentGroupId = row.override_group_id ?? row.food_group_id;
    const currentSubgroupId = row.override_subgroup_id ?? row.food_subgroup_id;
    const currentServingQty = row.override_serving_qty ?? row.base_serving_qty;
    const currentServingUnit = row.override_serving_unit ?? row.base_serving_unit;

    const currentGroupCode = currentGroupId ? groupCodeById.get(currentGroupId) ?? inferGroupCodeFromText(row.food_group_name) : null;

    let recommendedGroupId = currentGroupId;
    let recommendedSubgroupId = currentSubgroupId;

    const canonicalProtein = row.canonical_protein_g ?? 0;
    const canonicalCarbs = row.canonical_carbs_g ?? 0;
    const canonicalFat = row.canonical_fat_g ?? 0;

    const external = externalByNormalizedName.get(normalizedName);
    if (external) {
      const externalBucket = mapExternalAliasToBucket(
        external.groupAlias,
        external.proteinPer100,
        external.fatPer100,
      );

      if (externalBucket) {
        const externalGroupId = mxMappings.groupIdByCode.get(externalBucket.groupCode) ?? null;
        const externalSubgroupId = externalBucket.subgroupCode
          ? mxMappings.subgroupIdByCode.get(externalBucket.subgroupCode) ?? null
          : null;

        if (externalGroupId !== null) {
          recommendedGroupId = externalGroupId;
          recommendedSubgroupId = externalSubgroupId;

          if (currentGroupId !== null && currentGroupId !== externalGroupId) {
            conflictRows.push({
              food_id: String(row.food_id),
              name: row.name,
              conflict_type: 'group_mismatch_external',
              details: `current_group_id=${currentGroupId}; external_group_id=${externalGroupId}; alias=${external.groupAlias}`,
            });
          }
        }
      }
    }

    const heuristicGroupCode = inferGroupByHeuristics(
      row.name,
      canonicalProtein,
      canonicalCarbs,
      canonicalFat,
    );
    if (heuristicGroupCode) {
      const heuristicGroupId = mxMappings.groupIdByCode.get(heuristicGroupCode) ?? null;
      if (heuristicGroupId !== null) {
        const recommendedGroupCodeBefore =
          recommendedGroupId !== null ? groupCodeById.get(recommendedGroupId) ?? null : null;
        const shouldOverrideRecommendedGroup =
          recommendedGroupId === null ||
          recommendedGroupCodeBefore === 'carb' ||
          (recommendedGroupCodeBefore === 'protein' && heuristicGroupCode === 'legume');

        if (shouldOverrideRecommendedGroup) {
          recommendedGroupId = heuristicGroupId;
          recommendedSubgroupId = null;
        }
      }
    }

    if (recommendedSubgroupId && mxMappings.parentGroupIdBySubgroupId.has(recommendedSubgroupId)) {
      const parentGroupId = mxMappings.parentGroupIdBySubgroupId.get(recommendedSubgroupId) ?? null;
      if (parentGroupId !== null) {
        recommendedGroupId = parentGroupId;
      }
    }

    const groupCode = recommendedGroupId ? groupCodeById.get(recommendedGroupId) : currentGroupCode;

    if (groupCode && recommendedSubgroupId === null && mandatorySubgroupGroupCodes.has(groupCode)) {
      const inferredSubgroupCode = inferRequiredSubgroup(
        groupCode,
        row.name,
        canonicalProtein,
        canonicalCarbs,
        canonicalFat,
      );
      if (inferredSubgroupCode) {
        recommendedSubgroupId = mxMappings.subgroupIdByCode.get(inferredSubgroupCode) ?? null;
      }
    }

    if (recommendedSubgroupId && mxMappings.parentGroupIdBySubgroupId.has(recommendedSubgroupId)) {
      recommendedGroupId = mxMappings.parentGroupIdBySubgroupId.get(recommendedSubgroupId) ?? recommendedGroupId;
    }

    const recommendedGroupCode = recommendedGroupId ? groupCodeById.get(recommendedGroupId) : null;
    const guideMatch = bestGuideTokenMatch(row.name, guideTokens);

    const servingRecommendation = chooseServing(
      servingByFoodId.get(row.food_id),
      external?.equiQty ?? null,
      recommendedGroupCode ?? currentGroupCode ?? 'carb',
      row.name,
      external?.unitsRaw ?? '',
      guideMatch,
      currentServingQty,
      currentServingUnit,
    );

    const sourceIsSmae = sourceNameIsSmae(row.canonical_data_source_name);

    let action: Recommendation['action'] = 'keep';
    const notes: string[] = [servingRecommendation.notes];

    if (!sourceIsSmae) {
      action = 'exclude_runtime';
      notes.push('Canonical source is not SMAE/MEX');
    }

    if (!recommendedGroupId) {
      action = 'review_required';
      notes.push('Missing recommended group id');
    }

    if (
      recommendedGroupCode &&
      mandatorySubgroupGroupCodes.has(recommendedGroupCode) &&
      !recommendedSubgroupId &&
      action !== 'exclude_runtime'
    ) {
      action = 'review_required';
      notes.push('Mandatory subgroup unresolved');
    }

    if (servingRecommendation.evidenceSource === 'manual_override_required' && action !== 'exclude_runtime') {
      action = 'review_required';
      notes.push('Serving requires manual override');
    }

    const differs =
      currentGroupId !== recommendedGroupId ||
      currentSubgroupId !== recommendedSubgroupId ||
      (servingRecommendation.recommendedServingQty !== null &&
        currentServingQty !== null &&
        Math.abs(servingRecommendation.recommendedServingQty - currentServingQty) > 0.01) ||
      (servingRecommendation.recommendedServingUnit ?? '') !== (currentServingUnit ?? '');

    if (action === 'keep' && differs) {
      action = 'update';
    }

    if (action === 'review_required') {
      conflictRows.push({
        food_id: String(row.food_id),
        name: row.name,
        conflict_type: 'review_required',
        details: notes.join(' | '),
      });
    }

    const recommendedGroupCodeText =
      (recommendedGroupId ? groupCodeById.get(recommendedGroupId) : undefined) ?? '';

    const recommendedSubgroupCodeText =
      (recommendedSubgroupId ? subgroupCodeById.get(recommendedSubgroupId) : undefined) ?? '';

    auditRows.push({
      food_id: String(row.food_id),
      name: row.name,
      current_group_id: currentGroupId !== null ? String(currentGroupId) : '',
      current_subgroup_id: currentSubgroupId !== null ? String(currentSubgroupId) : '',
      current_serving_qty: currentServingQty !== null ? String(currentServingQty) : '',
      current_serving_unit: currentServingUnit ?? '',
      recommended_group_id: recommendedGroupId !== null ? String(recommendedGroupId) : '',
      recommended_subgroup_id: recommendedSubgroupId !== null ? String(recommendedSubgroupId) : '',
      recommended_serving_qty:
        servingRecommendation.recommendedServingQty !== null
          ? String(round2(servingRecommendation.recommendedServingQty))
          : '',
      recommended_serving_unit: servingRecommendation.recommendedServingUnit ?? '',
      recommended_group_code: recommendedGroupCodeText,
      recommended_subgroup_code: recommendedSubgroupCodeText,
      evidence_source: servingRecommendation.evidenceSource,
      confidence: servingRecommendation.confidence,
      action,
      canonical_data_source: row.canonical_data_source_name ?? '',
      external_match_group_alias: external?.groupAlias ?? '',
      external_match_equi_qty: external?.equiQty !== null && external?.equiQty !== undefined ? String(external.equiQty) : '',
      external_match_units: external?.unitsRaw ?? '',
      notes: notes.join(' | '),
    });
  }

  const candidateRows: Record<string, string>[] = [];
  const candidateSeen = new Set<string>();

  for (const external of externalFoods) {
    if (external.groupAlias === 'LIBRE') continue;
    if (external.equiQty === null || external.equiQty <= 0) continue;
    if (existingNormalizedNames.has(external.normalizedName)) continue;
    if (candidateSeen.has(external.normalizedName)) continue;

    const bucket = mapExternalAliasToBucket(external.groupAlias, external.proteinPer100, external.fatPer100);
    if (!bucket) continue;

    let subgroupCode = bucket.subgroupCode;
    if (!subgroupCode && mandatorySubgroupGroupCodes.has(bucket.groupCode)) {
      subgroupCode = inferRequiredSubgroup(
        bucket.groupCode,
        external.rawName,
        external.proteinPer100,
        external.carbsPer100,
        external.fatPer100,
      );
    }

    if (mandatorySubgroupGroupCodes.has(bucket.groupCode) && !subgroupCode) {
      conflictRows.push({
        food_id: '',
        name: external.rawName,
        conflict_type: 'new_candidate_missing_subgroup',
        details: `group_alias=${external.groupAlias}; origin=${external.origin}`,
      });
      continue;
    }

    const portionQty = round2(external.equiQty);
    const portionUnit = inferPortionUnit(bucket.groupCode, external.rawName, external.unitsRaw);
    const multiplier = portionQty / 100;
    const carbsServing = round2(external.carbsPer100 * multiplier);
    const proteinServing = round2(external.proteinPer100 * multiplier);
    const fatServing = round2(external.fatPer100 * multiplier);
    const caloriesServing = round2((carbsServing + proteinServing) * 4 + fatServing * 9);

    candidateRows.push({
      name: external.rawName,
      group_code: bucket.groupCode,
      subgroup_code: subgroupCode ?? '',
      portion_qty: String(portionQty),
      portion_unit: portionUnit,
      calories_kcal: String(caloriesServing),
      protein_g: String(proteinServing),
      carbs_g: String(carbsServing),
      fat_g: String(fatServing),
      carbs_per_100: String(round2(external.carbsPer100)),
      protein_per_100: String(round2(external.proteinPer100)),
      fat_per_100: String(round2(external.fatPer100)),
      source_origin: external.origin,
      source_group_alias: external.groupAlias,
      source_equi_qty: String(portionQty),
      source_units: external.unitsRaw,
      confidence: external.unitsRaw ? 'medium' : 'low',
      action: 'candidate_insert',
    });

    candidateSeen.add(external.normalizedName);
  }

  const auditPath = path.join(tmpDir, 'smae_food_audit.csv');
  const candidatesPath = path.join(tmpDir, 'smae_new_food_candidates.csv');
  const conflictsPath = path.join(tmpDir, 'smae_food_conflicts.csv');

  await Promise.all([
    writeCsv(auditPath, auditRows, [
      'food_id',
      'name',
      'current_group_id',
      'current_subgroup_id',
      'current_serving_qty',
      'current_serving_unit',
      'recommended_group_id',
      'recommended_subgroup_id',
      'recommended_serving_qty',
      'recommended_serving_unit',
      'recommended_group_code',
      'recommended_subgroup_code',
      'evidence_source',
      'confidence',
      'action',
      'canonical_data_source',
      'external_match_group_alias',
      'external_match_equi_qty',
      'external_match_units',
      'notes',
    ]),
    writeCsv(candidatesPath, candidateRows, [
      'name',
      'group_code',
      'subgroup_code',
      'portion_qty',
      'portion_unit',
      'calories_kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'carbs_per_100',
      'protein_per_100',
      'fat_per_100',
      'source_origin',
      'source_group_alias',
      'source_equi_qty',
      'source_units',
      'confidence',
      'action',
    ]),
    writeCsv(conflictsPath, conflictRows, ['food_id', 'name', 'conflict_type', 'details']),
  ]);

  const actionSummary = auditRows.reduce<Record<string, number>>((acc, row) => {
    const key = row.action || 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`SMAE audit generated: ${auditPath}`);
  console.log(`SMAE candidates generated: ${candidatesPath}`);
  console.log(`SMAE conflicts generated: ${conflictsPath}`);
  console.log('Action summary:', actionSummary);
  console.log(`New candidate rows: ${candidateRows.length}`);
  console.log(`Conflicts: ${conflictRows.length}`);
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await nutritionPool.end().catch(() => undefined);
  });

