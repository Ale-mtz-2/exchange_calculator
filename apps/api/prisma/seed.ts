import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import {
  COUNTRY_STATES,
  DEFAULT_KCAL_SELECTION_POLICIES_BY_SYSTEM,
  DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM,
  EXCHANGE_SYSTEMS,
  KCAL_FORMULAS,
  type ExchangeSystemId,
} from '@equivalentes/shared';

import { inferGroupCodeFromText, inferSubgroupCodeFromText } from '../src/services/groupCodeMapper.js';
import { syncGeoMetadataBaselineWithPrisma } from '../src/services/geoMetadataBaseline.js';

const prisma = new PrismaClient();

const SUPPORTED_SYSTEMS = ['mx_smae', 'us_usda'] as const;
type SupportedSystemId = (typeof SUPPORTED_SYSTEMS)[number];

const SYSTEM_NAME_MATCHERS: Record<SupportedSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'united states', 'usa'],
};

const MX_CLASSIFICATION_RULES = [
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_muy_bajo_grasa',
    minFatPer7gPro: 0,
    maxFatPer7gPro: 1.5,
    priority: 1,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_bajo_grasa',
    minFatPer7gPro: 1.5,
    maxFatPer7gPro: 4,
    priority: 2,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_moderado_grasa',
    minFatPer7gPro: 4,
    maxFatPer7gPro: 7,
    priority: 3,
  },
  {
    systemId: 'mx_smae',
    parentGroupCode: 'protein',
    subgroupCode: 'aoa_alto_grasa',
    minFatPer7gPro: 7,
    maxFatPer7gPro: null,
    priority: 4,
  },
] as const;

const SOURCE_KEYWORDS_BY_SYSTEM: Record<string, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'usa', 'united states'],
};

type NutritionSystemRow = {
  id: number;
  name: string;
};

type NutritionGroupRow = {
  id: number;
  system_id: number;
  name: string;
};

type NutritionSubgroupRow = {
  id: number;
  system_id: number;
  exchange_group_id: number;
  name: string;
  parent_group_name: string;
};

type MxClassificationRow = {
  food_id: number;
  group_code: string;
  subgroup_code: string | null;
  serving_qty: number | null;
  serving_unit: string | null;
};

type NutritionMappings = {
  nutritionSystemIdByApp: Map<SupportedSystemId, number>;
  groupIdByCodeBySystem: Map<string, Map<string, number>>;
  subgroupIdByCodeBySystem: Map<string, Map<string, number>>;
  parentGroupIdBySubgroupId: Map<number, number>;
};

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const resolveNutritionSystemMap = (rows: NutritionSystemRow[]): Map<SupportedSystemId, number> => {
  const map = new Map<SupportedSystemId, number>();

  for (const appSystemId of SUPPORTED_SYSTEMS) {
    const tokens = SYSTEM_NAME_MATCHERS[appSystemId];
    const match = rows.find((row) => {
      const name = normalize(row.name);
      return tokens.some((token) => name.includes(normalize(token)));
    });

    if (!match) {
      throw new Error(`No nutrition.exchange_systems match found for ${appSystemId}`);
    }

    map.set(appSystemId, match.id);
  }

  return map;
};

const sourcePriorityForSystem = (systemId: string, sourceName: string | null): number => {
  const keywords = SOURCE_KEYWORDS_BY_SYSTEM[systemId] ?? [];
  const normalized = (sourceName ?? '').trim().toLowerCase();
  if (!normalized) return keywords.length;

  for (let index = 0; index < keywords.length; index += 1) {
    const keyword = keywords[index];
    if (keyword && normalized.includes(keyword)) return index;
  }

  return keywords.length;
};

const loadNutritionMappings = async (): Promise<NutritionMappings> => {
  const [systems, groups, subgroups] = await Promise.all([
    prisma.$queryRawUnsafe<NutritionSystemRow[]>(`
      SELECT id, name
      FROM nutrition.exchange_systems
      ORDER BY id ASC;
    `),
    prisma.$queryRawUnsafe<NutritionGroupRow[]>(`
      SELECT id, system_id, name
      FROM nutrition.exchange_groups
      ORDER BY system_id ASC, id ASC;
    `),
    prisma.$queryRawUnsafe<NutritionSubgroupRow[]>(`
      SELECT
        es.id,
        eg.system_id,
        es.exchange_group_id,
        es.name,
        eg.name AS parent_group_name
      FROM nutrition.exchange_subgroups es
      JOIN nutrition.exchange_groups eg
        ON eg.id = es.exchange_group_id
      ORDER BY eg.system_id ASC, es.id ASC;
    `),
  ]);

  const nutritionSystemIdByApp = resolveNutritionSystemMap(systems);
  const appSystemIdByNutrition = new Map<number, SupportedSystemId>(
    Array.from(nutritionSystemIdByApp.entries()).map(([appSystemId, nutritionSystemId]) => [nutritionSystemId, appSystemId]),
  );

  const groupIdByCodeBySystem = new Map<string, Map<string, number>>();
  for (const row of groups) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;
    const groupCode = inferGroupCodeFromText(row.name);
    const map = groupIdByCodeBySystem.get(appSystemId) ?? new Map<string, number>();
    if (!map.has(groupCode)) {
      map.set(groupCode, row.id);
    }
    groupIdByCodeBySystem.set(appSystemId, map);
  }

  const subgroupIdByCodeBySystem = new Map<string, Map<string, number>>();
  const parentGroupIdBySubgroupId = new Map<number, number>();
  for (const row of subgroups) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;

    const parentGroupCode = inferGroupCodeFromText(row.parent_group_name);
    const subgroupCode = inferSubgroupCodeFromText(row.name, parentGroupCode);
    if (!subgroupCode) continue;

    const map = subgroupIdByCodeBySystem.get(appSystemId) ?? new Map<string, number>();
    if (!map.has(subgroupCode)) {
      map.set(subgroupCode, row.id);
    }
    subgroupIdByCodeBySystem.set(appSystemId, map);
    parentGroupIdBySubgroupId.set(row.id, row.exchange_group_id);
  }

  return {
    nutritionSystemIdByApp,
    groupIdByCodeBySystem,
    subgroupIdByCodeBySystem,
    parentGroupIdBySubgroupId,
  };
};

const seedMxDefaultOverrides = async (
  groupIdByCodeBySystem: Map<string, Map<string, number>>,
  subgroupIdByCodeBySystem: Map<string, Map<string, number>>,
): Promise<void> => {
  const rows = await prisma.$queryRawUnsafe<MxClassificationRow[]>(`
    WITH latest_nutri AS (
      SELECT DISTINCT ON (fnv.food_id)
        fnv.food_id,
        COALESCE(fnv.protein_g, 0)::float8 AS protein_g,
        COALESCE(fnv.carbs_g, 0)::float8 AS carbs_g,
        COALESCE(fnv.fat_g, 0)::float8 AS fat_g,
        COALESCE(fnv.base_serving_size, 100)::float8 AS serving_qty,
        COALESCE(fnv.base_unit, 'g') AS serving_unit
      FROM nutrition.food_nutrition_values fnv
      LEFT JOIN nutrition.data_sources ds ON ds.id = fnv.data_source_id
      WHERE fnv.deleted_at IS NULL
      ORDER BY fnv.food_id,
        CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
        CASE
          WHEN COALESCE(ds.name, '') ILIKE '%smae%' THEN 0
          WHEN COALESCE(ds.name, '') ILIKE '%mex%' THEN 1
          ELSE 2
        END,
        fnv.id DESC
    ),
    base AS (
      SELECT
        f.id AS food_id,
        lower(COALESCE(f.name, '')) AS food_name,
        lower(COALESCE(fc.name, '')) AS category_name,
        lower(COALESCE(ng.name, '')) AS exchange_group_name,
        COALESCE(ln.protein_g, f.protein_g, 0)::float8 AS protein_g,
        COALESCE(ln.carbs_g, f.carbs_g, 0)::float8 AS carbs_g,
        COALESCE(ln.fat_g, f.fat_g, 0)::float8 AS fat_g,
        CASE
          WHEN f.base_serving_size IS NOT NULL AND f.base_serving_size > 0
            THEN f.base_serving_size::float8
          ELSE NULL
        END AS serving_qty,
        NULLIF(BTRIM(f.base_unit), '') AS serving_unit
      FROM nutrition.foods f
      LEFT JOIN nutrition.food_categories fc ON fc.id = f.category_id
      LEFT JOIN nutrition.exchange_groups ng ON ng.id = f.exchange_group_id
      LEFT JOIN latest_nutri ln ON ln.food_id = f.id
    ),
    classified AS (
      SELECT
        b.food_id,
        b.serving_qty,
        b.serving_unit,
        CASE
          WHEN (b.exchange_group_name LIKE '%grasa%' OR b.category_name LIKE '%grasa%') THEN 'fat'
          WHEN (b.exchange_group_name LIKE '%verdura%' OR b.category_name LIKE '%verdura%') THEN 'vegetable'
          WHEN (b.exchange_group_name LIKE '%fruta%' OR b.category_name LIKE '%fruta%') THEN 'fruit'
          WHEN (b.exchange_group_name LIKE '%leche%' OR b.category_name LIKE '%lacteo%') THEN 'milk'
          WHEN (b.exchange_group_name LIKE '%azucar%' OR b.category_name LIKE '%azucar%') THEN 'sugar'
          WHEN (b.exchange_group_name LIKE '%prote%' OR b.category_name LIKE '%prote%') THEN
            CASE
              WHEN (
                b.food_name ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
                OR b.category_name LIKE '%legum%'
                OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
              ) THEN 'legume'
              ELSE 'protein'
            END
          ELSE 'carb'
        END AS group_code,
        CASE
          WHEN (
            (b.exchange_group_name LIKE '%prote%' OR b.category_name LIKE '%prote%')
            AND NOT (
              b.food_name ~ '(frijol|lenteja|garbanzo|haba|edamame|soya|soja|alubia|judia|chicharo|chichar)'
              OR b.category_name LIKE '%legum%'
              OR (b.protein_g >= 6 AND b.carbs_g >= 10 AND b.fat_g <= 6)
            )
          ) THEN
            CASE
              WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 1.5 THEN 'aoa_muy_bajo_grasa'
              WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 4 THEN 'aoa_bajo_grasa'
              WHEN ((b.fat_g / GREATEST(b.protein_g, 0.1)) * 7) < 7 THEN 'aoa_moderado_grasa'
              ELSE 'aoa_alto_grasa'
            END
          WHEN (b.exchange_group_name LIKE '%cereal%' OR b.category_name LIKE '%cereal%' OR b.category_name LIKE '%tuberc%')
            THEN CASE WHEN b.fat_g <= 1 THEN 'cereal_sin_grasa' ELSE 'cereal_con_grasa' END
          WHEN (b.exchange_group_name LIKE '%leche%' OR b.category_name LIKE '%lacteo%')
            THEN CASE
              WHEN b.carbs_g > 20 THEN 'leche_con_azucar'
              WHEN b.fat_g <= 2 THEN 'leche_descremada'
              WHEN b.fat_g <= 5 THEN 'leche_semidescremada'
              ELSE 'leche_entera'
            END
          WHEN (b.exchange_group_name LIKE '%azucar%' OR b.category_name LIKE '%azucar%')
            THEN CASE WHEN b.fat_g <= 1 THEN 'azucar_sin_grasa' ELSE 'azucar_con_grasa' END
          WHEN (b.exchange_group_name LIKE '%grasa%' OR b.category_name LIKE '%grasa%')
            THEN CASE WHEN b.protein_g >= 1.5 THEN 'grasa_con_proteina' ELSE 'grasa_sin_proteina' END
          ELSE NULL
        END AS subgroup_code
      FROM base b
    )
    SELECT food_id, group_code, subgroup_code, serving_qty, serving_unit
    FROM classified;
  `);

  const groupMap = groupIdByCodeBySystem.get('mx_smae');
  const subgroupMap = subgroupIdByCodeBySystem.get('mx_smae');
  if (!groupMap || !subgroupMap) {
    throw new Error('Missing nutrition mappings for mx_smae');
  }

  for (const row of rows) {
    const groupId = groupMap.get(row.group_code);
    if (!groupId) continue;

    const subgroupId = row.subgroup_code ? subgroupMap.get(row.subgroup_code) ?? null : null;

    await prisma.foodExchangeOverride.upsert({
      where: {
        foodId_systemId: {
          foodId: row.food_id,
          systemId: 'mx_smae',
        },
      },
      update: {
        groupId,
        subgroupId,
        equivalentPortionQty: row.serving_qty,
        portionUnit: row.serving_unit,
        isActive: true,
      },
      create: {
        foodId: row.food_id,
        systemId: 'mx_smae',
        groupId,
        subgroupId,
        equivalentPortionQty: row.serving_qty,
        portionUnit: row.serving_unit,
        isActive: true,
      },
    });
  }
};

const seed = async (): Promise<void> => {
  const {
    groupIdByCodeBySystem,
    subgroupIdByCodeBySystem,
    parentGroupIdBySubgroupId,
  } = await loadNutritionMappings();

  for (const formula of KCAL_FORMULAS) {
    await prisma.kcalFormula.upsert({
      where: { id: formula.id },
      update: {
        name: formula.name,
        description: formula.description,
        isActive: true,
        sortOrder: formula.sortOrder,
      },
      create: {
        id: formula.id,
        name: formula.name,
        description: formula.description,
        isActive: true,
        sortOrder: formula.sortOrder,
      },
    });
  }

  for (const system of EXCHANGE_SYSTEMS) {
    const isSupported = (SUPPORTED_SYSTEMS as readonly string[]).includes(system.id);
    await prisma.exchangeSystem.upsert({
      where: { id: system.id },
      update: {
        countryCode: system.countryCode,
        name: system.name,
        source: system.source,
        isActive: Boolean(system.isActive && isSupported),
      },
      create: {
        id: system.id,
        countryCode: system.countryCode,
        name: system.name,
        source: system.source,
        isActive: Boolean(system.isActive && isSupported),
      },
    });
  }

  for (const [systemId, policies] of Object.entries(DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM)) {
    if (!(SUPPORTED_SYSTEMS as readonly string[]).includes(systemId)) continue;

    const subgroupMap = subgroupIdByCodeBySystem.get(systemId);
    if (!subgroupMap) {
      throw new Error(`No subgroup mapping found for ${systemId}`);
    }

    for (const policy of policies ?? []) {
      const subgroupId = subgroupMap.get(policy.subgroupCode);
      if (!subgroupId) {
        throw new Error(`No nutrition subgroup ID found for ${systemId}:${policy.subgroupCode}`);
      }

      await prisma.subgroupSelectionPolicy.upsert({
        where: {
          systemId_goal_dietPattern_subgroupId: {
            systemId,
            goal: policy.goal,
            dietPattern: policy.dietPattern,
            subgroupId,
          },
        },
        update: {
          targetSharePct: policy.targetSharePct,
          scoreAdjustment: policy.scoreAdjustment,
          isActive: true,
        },
        create: {
          systemId,
          goal: policy.goal,
          dietPattern: policy.dietPattern,
          subgroupId,
          targetSharePct: policy.targetSharePct,
          scoreAdjustment: policy.scoreAdjustment,
          isActive: true,
        },
      });
    }
  }

  for (const [systemId, policy] of Object.entries(DEFAULT_KCAL_SELECTION_POLICIES_BY_SYSTEM)) {
    if (!(SUPPORTED_SYSTEMS as readonly string[]).includes(systemId)) continue;

    await prisma.kcalSelectionPolicy.upsert({
      where: { systemId },
      update: {
        lowTargetKcal: policy.lowTargetKcal,
        highTargetKcal: policy.highTargetKcal,
        minTolerancePct: policy.minTolerancePct,
        maxTolerancePct: policy.maxTolerancePct,
        minToleranceKcal: policy.minToleranceKcal,
        softPenaltyPer10Pct: policy.softPenaltyPer10Pct,
        hardOutlierMultiplier: policy.hardOutlierMultiplier,
        excludeHardOutliers: policy.excludeHardOutliers,
        isActive: true,
      },
      create: {
        systemId,
        lowTargetKcal: policy.lowTargetKcal,
        highTargetKcal: policy.highTargetKcal,
        minTolerancePct: policy.minTolerancePct,
        maxTolerancePct: policy.maxTolerancePct,
        minToleranceKcal: policy.minToleranceKcal,
        softPenaltyPer10Pct: policy.softPenaltyPer10Pct,
        hardOutlierMultiplier: policy.hardOutlierMultiplier,
        excludeHardOutliers: policy.excludeHardOutliers,
        isActive: true,
      },
    });
  }

  for (const rule of MX_CLASSIFICATION_RULES) {
    const groupMap = groupIdByCodeBySystem.get(rule.systemId);
    const subgroupMap = subgroupIdByCodeBySystem.get(rule.systemId);
    if (!groupMap || !subgroupMap) {
      throw new Error(`Missing nutrition mapping for ${rule.systemId}`);
    }

    const parentGroupId = groupMap.get(rule.parentGroupCode);
    const subgroupId = subgroupMap.get(rule.subgroupCode);
    if (!parentGroupId || !subgroupId) {
      throw new Error(`Missing IDs for classification rule ${rule.parentGroupCode}/${rule.subgroupCode}`);
    }

    const derivedParent = parentGroupIdBySubgroupId.get(subgroupId);
    if (derivedParent && derivedParent !== parentGroupId) {
      throw new Error(`Parent group mismatch for subgroup ${subgroupId}`);
    }

    await prisma.subgroupClassificationRule.upsert({
      where: {
        systemId_parentGroupId_subgroupId_priority: {
          systemId: rule.systemId,
          parentGroupId,
          subgroupId,
          priority: rule.priority,
        },
      },
      update: {
        minFatPer7gPro: rule.minFatPer7gPro,
        maxFatPer7gPro: rule.maxFatPer7gPro,
        isActive: true,
      },
      create: {
        systemId: rule.systemId,
        parentGroupId,
        subgroupId,
        minFatPer7gPro: rule.minFatPer7gPro,
        maxFatPer7gPro: rule.maxFatPer7gPro,
        priority: rule.priority,
        isActive: true,
      },
    });
  }

  const statesData = Object.entries(COUNTRY_STATES).flatMap(([countryCode, states]) =>
    states.map((state) => ({
      countryCode,
      stateCode: state.code,
      stateName: state.name,
    })),
  );

  await prisma.countryState.createMany({
    data: statesData,
    skipDuplicates: true,
  });

  await seedMxDefaultOverrides(groupIdByCodeBySystem, subgroupIdByCodeBySystem);

  const dataSources = await prisma.$queryRawUnsafe<Array<{ id: number; name: string | null }>>(`
    SELECT id, name
    FROM nutrition.data_sources
    ORDER BY id ASC;
  `);

  for (const systemId of SUPPORTED_SYSTEMS) {
    for (const source of dataSources) {
      const priority = sourcePriorityForSystem(systemId, source.name);
      await prisma.$executeRawUnsafe(
        `
          INSERT INTO equivalentes_app.exchange_source_priorities (
            system_id,
            data_source_id,
            priority,
            is_active
          )
          VALUES ($1, $2, $3, true)
          ON CONFLICT (system_id, data_source_id)
          DO UPDATE SET
            priority = EXCLUDED.priority,
            is_active = true;
        `,
        systemId,
        source.id,
        priority,
      );
    }
  }

  const geoSyncResults = await syncGeoMetadataBaselineWithPrisma(prisma);
  for (const result of geoSyncResults) {
    console.log(
      [
        `[seed][geo-metadata] ${result.systemId} (${result.countryCode})`,
        `nutrition_system_id=${result.nutritionSystemId}`,
        `deleted=${result.deletedRows}`,
        `inserted=${result.insertedRows}`,
      ].join(' | '),
    );
  }
};

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completed');
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
