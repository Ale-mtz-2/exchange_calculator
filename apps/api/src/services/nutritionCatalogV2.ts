import type {
  ExchangeGroupCode,
  ExchangeSubgroupCode,
  ExchangeSystemId,
  FoodItemV2,
  FoodTag,
  PatientProfile,
} from '@equivalentes/shared';

import { env, isSmaeSubgroupsEnabled } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';
import { inferGroupCodeFromText, inferSubgroupCodeFromText } from './groupCodeMapper.js';
import { resolveCanonicalNutritionValues } from './nutritionValueResolver.js';

const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);
const appSchema = safeSchema(env.DB_APP_SCHEMA);

const CATALOG_V2_TTL_MS = 5 * 60 * 1000;
const SYSTEM_NAME_NORMALIZER = "translate(lower(COALESCE(name, '')), 'áéíóúäëïöüñ', 'aeiouaeioun')";

const LEGUME_KEYWORDS = [
  'frijol',
  'frijoles',
  'lenteja',
  'lentejas',
  'garbanzo',
  'garbanzos',
  'haba',
  'habas',
  'edamame',
  'soya',
  'soja',
  'alubia',
  'judia',
  'judias',
  'chicharo',
  'chicharos',
  'tofu',
  'tempeh',
];

const SYSTEM_NAME_MATCHERS: Record<ExchangeSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'united states', 'usa'],
  es_exchange: ['espana', 'spain', 'es exchange', 'es_exchange'],
  ar_exchange: ['argentina', 'ar exchange', 'ar_exchange'],
};

type GroupMeta = {
  id: number;
  name: string;
  familyCode: ExchangeGroupCode;
};

type SubgroupMeta = {
  id: number;
  parentGroupId: number;
  name: string;
  parentGroupCode: ExchangeGroupCode;
  legacyCode?: ExchangeSubgroupCode;
};

type RawFoodRow = {
  id: number;
  name: string;
  exchange_group_id: number | null;
  exchange_group_name: string | null;
  category_name: string | null;
  base_serving_size: number | null;
  base_unit: string | null;
};

type OverrideRow = {
  food_id: number;
  group_id: number | null;
  subgroup_id: number | null;
  equivalent_portion_qty: number | null;
  portion_unit: string | null;
};

type InactiveOverrideRow = {
  food_id: number;
};

type ClassificationRuleRow = {
  subgroup_id: number | null;
  min_fat_per_7g_pro: number;
  max_fat_per_7g_pro: number | null;
  priority: number;
};

type ClassificationRule = {
  subgroupId: number;
  minFatPer7gPro: number;
  maxFatPer7gPro: number | null;
  priority: number;
};

type GeoWeightRow = {
  food_id: number;
  weight: number;
};

type TagRow = {
  food_id: number;
  tag_type: string;
  tag_value: string;
  weight: number | null;
};

type CatalogV2FetchOptions = {
  systemId: ExchangeSystemId;
  countryCode?: string;
  stateCode?: string;
};

type CatalogV2Result = {
  foods: FoodItemV2[];
  groupsById: Map<number, GroupMeta>;
  subgroupsById: Map<number, SubgroupMeta>;
};

type CatalogV2CacheEntry = {
  timestamp: number;
  data: CatalogV2Result;
};

const v2Cache = new Map<string, CatalogV2CacheEntry>();
const nutritionSystemIdByAppSystem = new Map<ExchangeSystemId, number>();

const normalizeText = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

const normalizePortionQty = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
};

const normalizePortionUnit = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isLikelyLegume = (
  foodName: string,
  categoryName: string,
  proteinG: number,
  carbsG: number,
  fatG: number,
): boolean => {
  const normalizedName = normalizeText(foodName);
  const normalizedCategory = normalizeText(categoryName);

  const keywordMatch = LEGUME_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
  if (keywordMatch || normalizedCategory.includes('legum')) {
    return true;
  }

  return proteinG >= 6 && carbsG >= 10 && fatG <= 6;
};

const classifyAoaSubgroup = (
  proteinG: number,
  fatG: number,
  rules: ClassificationRule[],
): number | null => {
  const fatPer7gPro = (fatG / Math.max(proteinG, 0.1)) * 7;

  for (const rule of rules) {
    const maxAllowed = rule.maxFatPer7gPro;
    const withinMin = fatPer7gPro >= rule.minFatPer7gPro;
    const withinMax = maxAllowed === null || fatPer7gPro < maxAllowed;
    if (withinMin && withinMax) {
      return rule.subgroupId;
    }
  }

  return null;
};

const classifyCerealSubgroupCode = (fatG: number): ExchangeSubgroupCode =>
  (fatG <= 1 ? 'cereal_sin_grasa' : 'cereal_con_grasa');

const classifyMilkSubgroupCode = (fatG: number, carbsG: number): ExchangeSubgroupCode => {
  if (carbsG > 20) return 'leche_con_azucar';
  if (fatG <= 2) return 'leche_descremada';
  if (fatG <= 5) return 'leche_semidescremada';
  return 'leche_entera';
};

const classifySugarSubgroupCode = (fatG: number): ExchangeSubgroupCode =>
  (fatG <= 1 ? 'azucar_sin_grasa' : 'azucar_con_grasa');

const classifyFatSubgroupCode = (proteinG: number): ExchangeSubgroupCode =>
  (proteinG >= 1.5 ? 'grasa_con_proteina' : 'grasa_sin_proteina');

const cacheKey = (options: CatalogV2FetchOptions): string =>
  `${options.systemId}:${options.countryCode ?? '_'}:${options.stateCode ?? '_'}`;

const mapTagsByFood = (rows: TagRow[]): Map<number, FoodTag[]> =>
  rows.reduce<Map<number, FoodTag[]>>((acc, row) => {
    const list = acc.get(row.food_id) ?? [];
    const tag: FoodTag = {
      type: row.tag_type as FoodTag['type'],
      value: row.tag_value,
    };
    if (row.weight !== null) {
      tag.weight = row.weight;
    }
    list.push(tag);
    acc.set(row.food_id, list);
    return acc;
  }, new Map<number, FoodTag[]>());

const buildSubgroupMaps = (
  rows: Array<{ id: number; parent_group_id: number; name: string; parent_group_name: string }>,
): {
  subgroupsById: Map<number, SubgroupMeta>;
  subgroupIdByLegacyCode: Map<ExchangeSubgroupCode, number>;
} => {
  const subgroupsById = new Map<number, SubgroupMeta>();
  const subgroupIdByLegacyCode = new Map<ExchangeSubgroupCode, number>();

  for (const row of rows) {
    const parentGroupCode = inferGroupCodeFromText(row.parent_group_name);
    const legacyCode = inferSubgroupCodeFromText(row.name, parentGroupCode);
    const meta: SubgroupMeta = {
      id: row.id,
      parentGroupId: row.parent_group_id,
      name: row.name,
      parentGroupCode,
      ...(legacyCode ? { legacyCode } : {}),
    };
    subgroupsById.set(row.id, meta);

    if (legacyCode && !subgroupIdByLegacyCode.has(legacyCode)) {
      subgroupIdByLegacyCode.set(legacyCode, row.id);
    }
  }

  return { subgroupsById, subgroupIdByLegacyCode };
};

const buildClassificationRules = (rows: ClassificationRuleRow[]): ClassificationRule[] =>
  rows
    .map((row) => {
      const subgroupId = row.subgroup_id;

      if (!subgroupId) return null;

      return {
        subgroupId,
        minFatPer7gPro: row.min_fat_per_7g_pro,
        maxFatPer7gPro: row.max_fat_per_7g_pro,
        priority: row.priority,
      };
    })
    .filter((row): row is ClassificationRule => row !== null)
    .sort((a, b) => a.priority - b.priority);

const resolveNutritionSystemId = async (systemId: ExchangeSystemId): Promise<number> => {
  const cached = nutritionSystemIdByAppSystem.get(systemId);
  if (cached) return cached;

  const tokens = SYSTEM_NAME_MATCHERS[systemId] ?? [systemId];
  const likeTokens = tokens.map((token) => `%${normalizeText(token)}%`);

  const result = await nutritionPool.query<{ id: number }>(
    `
      SELECT id
      FROM ${nutritionSchema}.exchange_systems
      WHERE ${SYSTEM_NAME_NORMALIZER} LIKE ANY($1::text[])
      ORDER BY id ASC
      LIMIT 1;
    `,
    [likeTokens],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`No nutrition.exchange_systems match found for ${systemId}`);
  }

  nutritionSystemIdByAppSystem.set(systemId, row.id);
  return row.id;
};

const fetchFoodsForOptions = async (options: CatalogV2FetchOptions): Promise<CatalogV2Result> => {
  const shouldClassifyMx = isSmaeSubgroupsEnabled && options.systemId === 'mx_smae';
  const nutritionSystemId = await resolveNutritionSystemId(options.systemId);

  const [canonicalValues, foodsResult, groupsResult, subgroupsResult, overridesResult, inactiveOverridesResult, rulesResult, tagsResult, geoWeightsResult] =
    await Promise.all([
      resolveCanonicalNutritionValues(options.systemId),
      nutritionPool.query<RawFoodRow>(
        `
          SELECT
            f.id,
            f.name,
            f.exchange_group_id,
            ng.name AS exchange_group_name,
            fc.name AS category_name,
            CASE
              WHEN f.base_serving_size IS NOT NULL AND f.base_serving_size > 0
                THEN f.base_serving_size::float8
              ELSE NULL
            END AS base_serving_size,
            NULLIF(BTRIM(f.base_unit), '') AS base_unit
          FROM ${nutritionSchema}.foods f
          LEFT JOIN ${nutritionSchema}.food_categories fc ON fc.id = f.category_id
          LEFT JOIN ${nutritionSchema}.exchange_groups ng ON ng.id = f.exchange_group_id
          WHERE ng.system_id = $1
          ORDER BY f.id;
        `,
        [nutritionSystemId],
      ),
      nutritionPool.query<{ id: number; name: string }>(
        `
          SELECT id, name
          FROM ${nutritionSchema}.exchange_groups
          WHERE system_id = $1
          ORDER BY id ASC;
        `,
        [nutritionSystemId],
      ),
      nutritionPool.query<{ id: number; parent_group_id: number; name: string; parent_group_name: string }>(
        `
          SELECT
            es.id,
            es.exchange_group_id AS parent_group_id,
            es.name,
            eg.name AS parent_group_name
          FROM ${nutritionSchema}.exchange_subgroups es
          JOIN ${nutritionSchema}.exchange_groups eg ON eg.id = es.exchange_group_id
          WHERE eg.system_id = $1
          ORDER BY es.id ASC;
        `,
        [nutritionSystemId],
      ),
      nutritionPool.query<OverrideRow>(
        `
          SELECT
            food_id,
            group_id,
            subgroup_id,
            equivalent_portion_qty::float8,
            portion_unit
          FROM ${appSchema}.food_exchange_overrides
          WHERE system_id = $1
            AND is_active = true;
        `,
        [options.systemId],
      ),
      options.systemId === 'mx_smae'
        ? nutritionPool.query<InactiveOverrideRow>(
          `
            SELECT food_id
            FROM ${appSchema}.food_exchange_overrides
            WHERE system_id = $1
              AND is_active = false;
          `,
          [options.systemId],
        )
        : Promise.resolve({ rows: [] as InactiveOverrideRow[] }),
      shouldClassifyMx
        ? nutritionPool.query<ClassificationRuleRow>(
          `
            SELECT
              subgroup_id,
              min_fat_per_7g_pro::float8,
              max_fat_per_7g_pro::float8,
              priority
            FROM ${appSchema}.subgroup_classification_rules
            WHERE system_id = $1
              AND is_active = true
            ORDER BY priority ASC;
          `,
          [options.systemId],
        )
        : Promise.resolve({ rows: [] as ClassificationRuleRow[] }),
      nutritionPool.query<TagRow>(
        `
          SELECT food_id, tag_type, tag_value, weight::float8
          FROM ${appSchema}.food_profile_tags;
        `,
      ),
      options.countryCode
        ? nutritionPool.query<GeoWeightRow>(
          `
            SELECT food_id, MAX(weight)::float8 AS weight
            FROM ${appSchema}.food_geo_weights
            WHERE country_code = $1
              AND ($2::text IS NULL OR state_code IS NULL OR state_code = $2)
            GROUP BY food_id;
          `,
          [options.countryCode, options.stateCode ?? null],
        )
        : Promise.resolve({ rows: [] as GeoWeightRow[] }),
    ]);

  const groupsById = new Map<number, GroupMeta>();
  for (const row of groupsResult.rows) {
    groupsById.set(row.id, {
      id: row.id,
      name: row.name,
      familyCode: inferGroupCodeFromText(row.name),
    });
  }

  const { subgroupsById, subgroupIdByLegacyCode } = buildSubgroupMaps(subgroupsResult.rows);
  const classificationRules = buildClassificationRules(rulesResult.rows);

  const overrideByFood = new Map<number, OverrideRow>(
    overridesResult.rows.map((row) => [row.food_id, row]),
  );
  const inactiveOverrideFoodIds = new Set<number>(
    inactiveOverridesResult.rows.map((row) => row.food_id),
  );
  const geoWeightByFood = new Map<number, number>(
    geoWeightsResult.rows.map((row) => [row.food_id, row.weight]),
  );
  const tagsByFood = mapTagsByFood(tagsResult.rows);

  const foods: FoodItemV2[] = [];

  for (const row of foodsResult.rows) {
    if (inactiveOverrideFoodIds.has(row.id)) continue;

    const canonical = canonicalValues.get(row.id);
    if (!canonical) continue;

    const override = overrideByFood.get(row.id);
    const proteinG = canonical.proteinG;
    const carbsG = canonical.carbsG;
    const fatG = canonical.fatG;

    let groupId = override?.group_id ?? row.exchange_group_id;
    let subgroupId = override?.subgroup_id ?? null;

    if (subgroupId) {
      const subgroup = subgroupsById.get(subgroupId);
      if (subgroup) {
        groupId = subgroup.parentGroupId;
      }
    }

    if (shouldClassifyMx && !subgroupId) {
      const groupFamily = inferGroupCodeFromText(row.exchange_group_name ?? row.category_name ?? '');

      if (groupFamily === 'protein') {
        const isLegume = isLikelyLegume(row.name, row.category_name ?? '', proteinG, carbsG, fatG);
        if (!isLegume) {
          subgroupId = classifyAoaSubgroup(proteinG, fatG, classificationRules);
        }
      } else if (groupFamily === 'carb') {
        subgroupId = subgroupIdByLegacyCode.get(classifyCerealSubgroupCode(fatG)) ?? null;
      } else if (groupFamily === 'milk') {
        subgroupId = subgroupIdByLegacyCode.get(classifyMilkSubgroupCode(fatG, carbsG)) ?? null;
      } else if (groupFamily === 'sugar') {
        subgroupId = subgroupIdByLegacyCode.get(classifySugarSubgroupCode(fatG)) ?? null;
      } else if (groupFamily === 'fat') {
        subgroupId = subgroupIdByLegacyCode.get(classifyFatSubgroupCode(proteinG)) ?? null;
      }

      if (subgroupId) {
        const subgroup = subgroupsById.get(subgroupId);
        if (subgroup) {
          groupId = subgroup.parentGroupId;
        }
      }
    }

    if (!groupId) continue;

    const bucketType = subgroupId ? 'subgroup' : 'group';
    const bucketId = subgroupId ?? groupId;
    const bucketKey = `${bucketType}:${bucketId}`;
    const groupKey = `group:${groupId}`;
    const subgroupKey = subgroupId ? `subgroup:${subgroupId}` : undefined;
    const legacySubgroupCode = subgroupId ? subgroupsById.get(subgroupId)?.legacyCode : undefined;
    const servingQty =
      normalizePortionQty(override?.equivalent_portion_qty) ??
      normalizePortionQty(row.base_serving_size) ??
      normalizePortionQty(canonical.servingQty) ??
      100;
    const servingUnit =
      normalizePortionUnit(override?.portion_unit) ??
      normalizePortionUnit(row.base_unit) ??
      normalizePortionUnit(canonical.servingUnit) ??
      'g';

    const next: FoodItemV2 = {
      id: row.id,
      name: row.name,
      groupCode: groupKey,
      carbsG,
      proteinG,
      fatG,
      caloriesKcal: canonical.caloriesKcal,
      servingQty,
      servingUnit,
      sourceSystemId: options.systemId,
      nutritionValueId: canonical.nutritionValueId,
      dataSourceId: canonical.dataSourceId,
      groupId,
      bucketType,
      bucketId,
      bucketKey,
      ...(subgroupId ? { subgroupId } : {}),
      ...(subgroupKey ? { subgroupCode: subgroupKey } : {}),
      ...(legacySubgroupCode ? { legacySubgroupCode } : {}),
    };

    const tags = tagsByFood.get(row.id);
    if (tags && tags.length > 0) {
      next.tags = tags;
    }

    const geoWeight = geoWeightByFood.get(row.id);
    if (typeof geoWeight === 'number') {
      next.geoWeight = geoWeight;
    }

    foods.push(next);
  }

  return { foods, groupsById, subgroupsById };
};

const loadFoodsCached = async (options: CatalogV2FetchOptions): Promise<CatalogV2Result> => {
  const key = cacheKey(options);
  const now = Date.now();
  const cached = v2Cache.get(key);

  if (cached && now - cached.timestamp < CATALOG_V2_TTL_MS) {
    return cached.data;
  }

  const data = await fetchFoodsForOptions(options);
  v2Cache.set(key, { timestamp: now, data });
  return data;
};

export const loadFoodsForSystemV2 = async (
  profile: PatientProfile,
): Promise<CatalogV2Result> =>
  loadFoodsCached({
    systemId: profile.systemId as ExchangeSystemId,
    countryCode: profile.countryCode,
    stateCode: profile.stateCode,
  });

export const loadFoodsForSystemIdV2 = async (
  systemId: ExchangeSystemId,
): Promise<CatalogV2Result> =>
  loadFoodsCached({ systemId });
