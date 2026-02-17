import type { ExchangeGroupCode, ExchangeSubgroupCode, ExchangeSystemId } from '@equivalentes/shared';
import type { FoodItem, FoodTag, PatientProfile } from '@equivalentes/shared';

import { env, isSmaeSubgroupsEnabled } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';
import { inferGroupCodeFromText } from './groupCodeMapper.js';

const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);
const appSchema = safeSchema(env.DB_APP_SCHEMA);


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

const normalizeText = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

const normalizeSubgroupCode = (value: string | null | undefined): ExchangeSubgroupCode | undefined => {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;

  const allowed: ExchangeSubgroupCode[] = [
    'aoa_muy_bajo_grasa',
    'aoa_bajo_grasa',
    'aoa_moderado_grasa',
    'aoa_alto_grasa',
    'cereal_sin_grasa',
    'cereal_con_grasa',
    'leche_descremada',
    'leche_semidescremada',
    'leche_entera',
    'leche_con_azucar',
    'azucar_sin_grasa',
    'azucar_con_grasa',
    'grasa_sin_proteina',
    'grasa_con_proteina',
  ];

  return allowed.find((item) => item === normalized);
};

const mapLegacyCountryAvailability = (dataSourceName: string | null): ('MX' | 'US')[] | undefined => {
  if (!dataSourceName) return undefined;

  const normalized = dataSourceName.toLowerCase();
  if (normalized.includes('mexico') || normalized.includes('smae')) {
    return ['MX'];
  }
  if (normalized.includes('usa') || normalized.includes('usda')) {
    return ['US'];
  }

  return undefined;
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

type ClassificationRule = {
  subgroupCode: ExchangeSubgroupCode;
  minFatPer7gPro: number;
  maxFatPer7gPro: number | null;
  priority: number;
};

const classifyAoaSubgroup = (
  proteinG: number,
  fatG: number,
  rules: ClassificationRule[],
): ExchangeSubgroupCode => {
  const fatPer7gPro = (fatG / Math.max(proteinG, 0.1)) * 7;

  for (const rule of rules) {
    const maxAllowed = rule.maxFatPer7gPro;
    const withinMin = fatPer7gPro >= rule.minFatPer7gPro;
    const withinMax = maxAllowed === null || fatPer7gPro < maxAllowed;

    if (withinMin && withinMax) {
      return rule.subgroupCode;
    }
  }

  if (fatPer7gPro < 1.5) return 'aoa_muy_bajo_grasa';
  if (fatPer7gPro < 4) return 'aoa_bajo_grasa';
  if (fatPer7gPro < 7) return 'aoa_moderado_grasa';
  return 'aoa_alto_grasa';
};

const classifyCerealSubgroup = (fatG: number): ExchangeSubgroupCode => {
  return fatG <= 1 ? 'cereal_sin_grasa' : 'cereal_con_grasa';
};

const classifyMilkSubgroup = (fatG: number, carbsG: number): ExchangeSubgroupCode => {
  if (carbsG > 20) return 'leche_con_azucar';
  if (fatG <= 2) return 'leche_descremada';
  if (fatG <= 5) return 'leche_semidescremada';
  return 'leche_entera';
};

const classifySugarSubgroup = (fatG: number): ExchangeSubgroupCode => {
  return fatG <= 1 ? 'azucar_sin_grasa' : 'azucar_con_grasa';
};

const classifyFatSubgroup = (proteinG: number): ExchangeSubgroupCode => {
  return proteinG >= 1.5 ? 'grasa_con_proteina' : 'grasa_sin_proteina';
};

type RawFoodRow = {
  id: number;
  name: string;
  exchange_group_name: string | null;
  category_name: string | null;
  data_source_name: string | null;
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_qty: number | null;
  serving_unit: string | null;
};

/* ── In-memory TTL cache for food catalog ── */

const CATALOG_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CatalogCacheEntry = {
  data: { foods: FoodItem[]; fallbackSystemMap: Map<number, ExchangeGroupCode> };
  timestamp: number;
};

const catalogCache = new Map<string, CatalogCacheEntry>();

const catalogCacheKey = (profile: PatientProfile): string =>
  `${profile.systemId}:${profile.countryCode}:${profile.stateCode ?? '_'}`;

const fetchFoodsForSystem = async (
  profile: PatientProfile,
): Promise<{ foods: FoodItem[]; fallbackSystemMap: Map<number, ExchangeGroupCode> }> => {
  const foodsSql = `
    SELECT
      f.id,
      f.name,
      ng.name AS exchange_group_name,
      fc.name AS category_name,
      ds.name AS data_source_name,
      COALESCE(fnv.calories_kcal, f.calories_kcal, 0)::float8 AS calories_kcal,
      COALESCE(fnv.protein_g, f.protein_g, 0)::float8 AS protein_g,
      COALESCE(fnv.carbs_g, f.carbs_g, 0)::float8 AS carbs_g,
      COALESCE(fnv.fat_g, f.fat_g, 0)::float8 AS fat_g,
      COALESCE(fnv.base_serving_size, f.base_serving_size, 100)::float8 AS serving_qty,
      COALESCE(fnv.base_unit, f.base_unit, 'g') AS serving_unit
    FROM ${nutritionSchema}.foods f
    LEFT JOIN ${nutritionSchema}.food_categories fc ON fc.id = f.category_id
    LEFT JOIN ${nutritionSchema}.exchange_groups ng ON ng.id = f.exchange_group_id
    LEFT JOIN LATERAL (
      SELECT fnv.*
      FROM ${nutritionSchema}.food_nutrition_values fnv
      WHERE fnv.food_id = f.id
        AND fnv.deleted_at IS NULL
      ORDER BY
        CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
        fnv.id DESC
      LIMIT 1
    ) fnv ON true
    LEFT JOIN ${nutritionSchema}.data_sources ds ON ds.id = fnv.data_source_id
    ORDER BY f.id;
  `;

  const shouldClassifyMx =
    isSmaeSubgroupsEnabled &&
    profile.systemId === 'mx_smae';

  const [foodsResult, overridesResult, geoWeightsResult, tagsResult, groupResult, subgroupResult, ruleResult] =
    await Promise.all([
      nutritionPool.query<RawFoodRow>(foodsSql),
      nutritionPool.query<{
        food_id: number;
        exchange_group_id: string | null;
        exchange_subgroup_id: string | null;
        equivalent_portion_qty: number | null;
        portion_unit: string | null;
      }>(
        `
        SELECT
          food_id,
          exchange_group_id::text,
          exchange_subgroup_id::text,
          equivalent_portion_qty::float8,
          portion_unit
        FROM ${appSchema}.food_exchange_overrides
        WHERE system_id = $1 AND is_active = true;
        `,
        [profile.systemId],
      ),
      nutritionPool.query<{ food_id: number; weight: number }>(
        `
        SELECT food_id, MAX(weight)::float8 AS weight
        FROM ${appSchema}.food_geo_weights
        WHERE country_code = $1
          AND (state_code IS NULL OR state_code = $2)
        GROUP BY food_id;
        `,
        [profile.countryCode, profile.stateCode],
      ),
      nutritionPool.query<{ food_id: number; tag_type: string; tag_value: string; weight: number | null }>(
        `
        SELECT food_id, tag_type, tag_value, weight::float8
        FROM ${appSchema}.food_profile_tags;
        `,
      ),
      nutritionPool.query<{ id: string; group_code: string }>(
        `
        SELECT id::text, group_code
        FROM ${appSchema}.exchange_groups
        WHERE system_id = $1;
        `,
        [profile.systemId],
      ),
      nutritionPool.query<{ id: string; subgroup_code: string; parent_group_code: string }>(
        `
        SELECT
          es.id::text,
          es.subgroup_code,
          eg.group_code AS parent_group_code
        FROM ${appSchema}.exchange_subgroups es
        JOIN ${appSchema}.exchange_groups eg ON eg.id = es.parent_group_id
        WHERE es.system_id = $1
          AND es.is_active = true;
        `,
        [profile.systemId],
      ),
      shouldClassifyMx
        ? nutritionPool.query<{
          subgroup_code: string;
          min_fat_per_7g_pro: number;
          max_fat_per_7g_pro: number | null;
          priority: number;
        }>(
          `
            SELECT
              subgroup_code,
              min_fat_per_7g_pro::float8,
              max_fat_per_7g_pro::float8,
              priority
            FROM ${appSchema}.subgroup_classification_rules
            WHERE system_id = $1
              AND parent_group_code = 'protein'
              AND is_active = true
            ORDER BY priority ASC;
            `,
          [profile.systemId],
        )
        : Promise.resolve({ rows: [] as Array<{ subgroup_code: string; min_fat_per_7g_pro: number; max_fat_per_7g_pro: number | null; priority: number }> }),
    ]);

  const classificationRules: ClassificationRule[] = ruleResult.rows
    .map((row) => {
      const subgroupCode = normalizeSubgroupCode(row.subgroup_code);
      if (!subgroupCode) return null;

      return {
        subgroupCode,
        minFatPer7gPro: row.min_fat_per_7g_pro,
        maxFatPer7gPro: row.max_fat_per_7g_pro,
        priority: row.priority,
      };
    })
    .filter((item): item is ClassificationRule => item !== null)
    .sort((a, b) => a.priority - b.priority);

  const groupCodeById = new Map<string, ExchangeGroupCode>(
    groupResult.rows.map((item) => [item.id, inferGroupCodeFromText(item.group_code)]),
  );

  const subgroupById = new Map<string, { subgroupCode: ExchangeSubgroupCode; parentGroupCode: ExchangeGroupCode }>();
  for (const row of subgroupResult.rows) {
    const subgroupCode = normalizeSubgroupCode(row.subgroup_code);
    if (!subgroupCode) continue;

    subgroupById.set(row.id, {
      subgroupCode,
      parentGroupCode: inferGroupCodeFromText(row.parent_group_code),
    });
  }

  const overrideByFood = new Map<
    number,
    {
      groupCode?: ExchangeGroupCode;
      subgroupCode?: ExchangeSubgroupCode;
      servingQty?: number;
      servingUnit?: string;
    }
  >();

  for (const row of overridesResult.rows) {
    const override = overrideByFood.get(row.food_id) ?? {};

    if (row.exchange_subgroup_id && subgroupById.has(row.exchange_subgroup_id)) {
      const subgroup = subgroupById.get(row.exchange_subgroup_id);
      if (subgroup) {
        override.groupCode = subgroup.parentGroupCode;
        override.subgroupCode = subgroup.subgroupCode;
      }
    } else if (row.exchange_group_id && groupCodeById.has(row.exchange_group_id)) {
      const overrideGroupCode = groupCodeById.get(row.exchange_group_id);
      if (overrideGroupCode) {
        override.groupCode = overrideGroupCode;
      }
    }

    if (row.equivalent_portion_qty && row.equivalent_portion_qty > 0) {
      override.servingQty = row.equivalent_portion_qty;
    }

    if (row.portion_unit) {
      override.servingUnit = row.portion_unit;
    }

    overrideByFood.set(row.food_id, override);
  }

  const geoWeightByFood = new Map<number, number>(
    geoWeightsResult.rows.map((item) => [item.food_id, item.weight]),
  );

  const tagsByFood = tagsResult.rows.reduce<Map<number, FoodTag[]>>((acc, row) => {
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

  const fallbackSystemMap = new Map<number, ExchangeGroupCode>();

  const foods: FoodItem[] = foodsResult.rows.map((row) => {
    const fallbackGroupCode = inferGroupCodeFromText(row.exchange_group_name ?? row.category_name ?? '');
    const override = overrideByFood.get(row.id);

    let groupCode = override?.groupCode ?? fallbackGroupCode;
    let subgroupCode = override?.subgroupCode;

    const proteinG = row.protein_g ?? 0;
    const carbsG = row.carbs_g ?? 0;
    const fatG = row.fat_g ?? 0;

    if (shouldClassifyMx && !subgroupCode && groupCode === 'protein') {
      const isLegume = isLikelyLegume(row.name, row.category_name ?? '', proteinG, carbsG, fatG);
      if (isLegume) {
        groupCode = 'legume';
      } else {
        subgroupCode = classifyAoaSubgroup(proteinG, fatG, classificationRules);
      }
    }

    if (shouldClassifyMx && !subgroupCode && groupCode === 'carb') {
      subgroupCode = classifyCerealSubgroup(fatG);
    }

    if (shouldClassifyMx && !subgroupCode && groupCode === 'milk') {
      subgroupCode = classifyMilkSubgroup(fatG, carbsG);
    }

    if (shouldClassifyMx && !subgroupCode && groupCode === 'sugar') {
      subgroupCode = classifySugarSubgroup(fatG);
    }

    if (shouldClassifyMx && !subgroupCode && groupCode === 'fat') {
      subgroupCode = classifyFatSubgroup(proteinG);
    }

    fallbackSystemMap.set(row.id, fallbackGroupCode);

    const food: FoodItem = {
      id: row.id,
      name: row.name,
      groupCode,
      carbsG,
      proteinG,
      fatG,
      caloriesKcal: row.calories_kcal ?? 0,
      servingQty: override?.servingQty ?? row.serving_qty ?? 100,
      servingUnit: override?.servingUnit ?? row.serving_unit ?? 'g',
      sourceSystemId: profile.systemId as ExchangeSystemId,
    };

    if (subgroupCode) {
      food.subgroupCode = subgroupCode;
    }

    const countryAvailability = mapLegacyCountryAvailability(row.data_source_name);
    if (countryAvailability) {
      food.countryAvailability = countryAvailability;
    }

    const tags = tagsByFood.get(row.id);
    if (tags) {
      food.tags = tags;
    }

    const geoWeight = geoWeightByFood.get(row.id);
    if (typeof geoWeight === 'number') {
      food.geoWeight = geoWeight;
    }

    return food;
  });

  return { foods, fallbackSystemMap };
};

/**
 * Public entry point — caches results by systemId + countryCode + stateCode
 * for CATALOG_TTL_MS. The nutrition catalog rarely changes, so this avoids
 * ~7 heavy DB queries on every plan generation.
 */
export const loadFoodsForSystem = async (
  profile: PatientProfile,
): Promise<{ foods: FoodItem[]; fallbackSystemMap: Map<number, ExchangeGroupCode> }> => {
  const key = catalogCacheKey(profile);
  const now = Date.now();
  const cached = catalogCache.get(key);

  if (cached && now - cached.timestamp < CATALOG_TTL_MS) {
    return cached.data;
  }

  const result = await fetchFoodsForSystem(profile);
  catalogCache.set(key, { data: result, timestamp: now });
  return result;
};
