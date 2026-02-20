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

const SUPPORTED_SYSTEMS = ['mx_smae', 'us_usda', 'es_exchange', 'ar_exchange'] as const;
type SupportedSystemId = (typeof SUPPORTED_SYSTEMS)[number];

const SYSTEM_NAME_MATCHERS: Record<SupportedSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'united states', 'usa'],
  es_exchange: ['espana', 'spain', 'bedca', 'es_exchange'],
  ar_exchange: ['argentina', 'argenfoods', 'ar_exchange'],
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
  es_exchange: ['bedca', 'aesan', 'espana', 'spain'],
  ar_exchange: ['argenfoods', 'argentina'],
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

const seedNutritionTables = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(`
    INSERT INTO nutrition.exchange_systems (id, name, country_code)
    VALUES
      (1, 'Sistema Mexicano de Alimentos Equivalentes (SMAE)', 'MX'),
      (2, 'USDA FoodData Central', 'US'),
      (3, 'Base de Datos Espanola de Composicion de Alimentos (BEDCA)', 'ES'),
      (4, 'Tabla Argentina de Composicion de Alimentos (Argenfoods)', 'AR')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      country_code = EXCLUDED.country_code;
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO nutrition.data_sources (id, name)
    VALUES
      (1, 'SMAE'),
      (2, 'USDA'),
      (3, 'BEDCA'),
      (4, 'ARGENFOODS')
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name;
  `);

  const groups = [
    { id: 1, systemId: 1, name: 'Verduras' },
    { id: 2, systemId: 1, name: 'Frutas' },
    { id: 3, systemId: 1, name: 'Cereales y Tuberculos' },
    { id: 4, systemId: 1, name: 'Leguminosas' },
    { id: 5, systemId: 1, name: 'Alimentos de Origen Animal' },
    { id: 6, systemId: 1, name: 'Leche' },
    { id: 7, systemId: 1, name: 'Aceites y Grasas' },
    { id: 8, systemId: 1, name: 'Azucares' },
    { id: 9, systemId: 1, name: 'Alimentos Libres de Energia' },
    { id: 10, systemId: 1, name: 'Bebidas Alcoholicas' },

    { id: 1201, systemId: 2, name: 'Vegetables' },
    { id: 1202, systemId: 2, name: 'Fruits' },
    { id: 1203, systemId: 2, name: 'Cereals and Tubers' },
    { id: 1204, systemId: 2, name: 'Legumes' },
    { id: 1205, systemId: 2, name: 'Animal Protein' },
    { id: 1206, systemId: 2, name: 'Milk and Dairy' },
    { id: 1207, systemId: 2, name: 'Fats and Oils' },
    { id: 1208, systemId: 2, name: 'Sugars and Sweets' },

    { id: 1301, systemId: 3, name: 'Verduras' },
    { id: 1302, systemId: 3, name: 'Frutas' },
    { id: 1303, systemId: 3, name: 'Cereales y Tuberculos' },
    { id: 1304, systemId: 3, name: 'Legumbres' },
    { id: 1305, systemId: 3, name: 'Proteinas de origen animal' },
    { id: 1306, systemId: 3, name: 'Leche y lacteos' },
    { id: 1307, systemId: 3, name: 'Aceites y grasas' },
    { id: 1308, systemId: 3, name: 'Azucares y dulces' },

    { id: 1401, systemId: 4, name: 'Verduras' },
    { id: 1402, systemId: 4, name: 'Frutas' },
    { id: 1403, systemId: 4, name: 'Cereales y tuberculos' },
    { id: 1404, systemId: 4, name: 'Legumbres' },
    { id: 1405, systemId: 4, name: 'Proteinas de origen animal' },
    { id: 1406, systemId: 4, name: 'Leche y lacteos' },
    { id: 1407, systemId: 4, name: 'Aceites y grasas' },
    { id: 1408, systemId: 4, name: 'Azucares y dulces' },
  ];

  for (const group of groups) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO nutrition.exchange_groups (id, system_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          system_id = EXCLUDED.system_id;
      `,
      group.id,
      group.systemId,
      group.name,
    );
  }

  const subgroups = [
    { id: 301, parentId: 3, name: 'Cereales sin Grasa', code: 'cereal_sin_grasa' },
    { id: 302, parentId: 3, name: 'Cereales con Grasa', code: 'cereal_con_grasa' },
    { id: 501, parentId: 5, name: 'AOA Muy Bajo Aporte de Grasa', code: 'aoa_muy_bajo_grasa' },
    { id: 502, parentId: 5, name: 'AOA Bajo Aporte de Grasa', code: 'aoa_bajo_grasa' },
    { id: 503, parentId: 5, name: 'AOA Moderado Aporte de Grasa', code: 'aoa_moderado_grasa' },
    { id: 504, parentId: 5, name: 'AOA Alto Aporte de Grasa', code: 'aoa_alto_grasa' },
    { id: 601, parentId: 6, name: 'Leche Descremada', code: 'leche_descremada' },
    { id: 602, parentId: 6, name: 'Leche Semidescremada', code: 'leche_semidescremada' },
    { id: 603, parentId: 6, name: 'Leche Entera', code: 'leche_entera' },
    { id: 604, parentId: 6, name: 'Leche con Azucar', code: 'leche_con_azucar' },
    { id: 701, parentId: 7, name: 'Grasas sin Proteina', code: 'grasa_sin_proteina' },
    { id: 702, parentId: 7, name: 'Grasas con Proteina', code: 'grasa_con_proteina' },
    { id: 801, parentId: 8, name: 'Azucares sin Grasa', code: 'azucar_sin_grasa' },
    { id: 802, parentId: 8, name: 'Azucares con Grasa', code: 'azucar_con_grasa' },
  ];

  for (const sub of subgroups) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO nutrition.exchange_subgroups (id, exchange_group_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          exchange_group_id = EXCLUDED.exchange_group_id,
          name = EXCLUDED.name;
      `,
      sub.id,
      sub.parentId,
      sub.name,
    );
  }
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



const seed = async (): Promise<void> => {
  await seedNutritionTables();

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

