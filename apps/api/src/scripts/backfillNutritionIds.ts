import 'dotenv/config';

import type { ExchangeGroupCode, ExchangeSubgroupCode } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { inferGroupCodeFromText, inferSubgroupCodeFromText } from '../services/groupCodeMapper.js';
import { safeSchema } from '../utils/sql.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const SUPPORTED_SYSTEMS = ['mx_smae', 'us_usda'] as const;
type SupportedSystemId = (typeof SUPPORTED_SYSTEMS)[number];

const GROUP_CODES = [
  'vegetable',
  'fruit',
  'carb',
  'protein',
  'fat',
  'legume',
  'milk',
  'sugar',
] as const satisfies readonly ExchangeGroupCode[];

const SUBGROUP_CODES = [
  'cereal_sin_grasa',
  'cereal_con_grasa',
  'aoa_muy_bajo_grasa',
  'aoa_bajo_grasa',
  'aoa_moderado_grasa',
  'aoa_alto_grasa',
  'leche_descremada',
  'leche_semidescremada',
  'leche_entera',
  'leche_con_azucar',
  'grasa_sin_proteina',
  'grasa_con_proteina',
  'azucar_sin_grasa',
  'azucar_con_grasa',
] as const satisfies readonly ExchangeSubgroupCode[];

const SUBGROUP_PARENT_BY_CODE: Record<ExchangeSubgroupCode, ExchangeGroupCode> = {
  cereal_sin_grasa: 'carb',
  cereal_con_grasa: 'carb',
  aoa_muy_bajo_grasa: 'protein',
  aoa_bajo_grasa: 'protein',
  aoa_moderado_grasa: 'protein',
  aoa_alto_grasa: 'protein',
  leche_descremada: 'milk',
  leche_semidescremada: 'milk',
  leche_entera: 'milk',
  leche_con_azucar: 'milk',
  grasa_sin_proteina: 'fat',
  grasa_con_proteina: 'fat',
  azucar_sin_grasa: 'sugar',
  azucar_con_grasa: 'sugar',
};

const SYSTEM_NAME_MATCHERS: Record<SupportedSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'united states', 'usa'],
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

type LegacyGroupRow = {
  system_id: string;
  group_code: string;
  display_name_es: string;
};

type LegacySubgroupRow = {
  system_id: string;
  parent_group_code: string;
  subgroup_code: string;
  display_name_es: string;
};

type FoodOverrideRow = {
  food_id: number;
  system_id: string;
  group_id: number | null;
  subgroup_id: number | null;
  group_code: string | null;
  subgroup_code: string | null;
};

type PolicyRow = {
  id: string;
  system_id: string;
  subgroup_id: number | null;
  subgroup_code: string | null;
};

type RuleRow = {
  id: string;
  system_id: string;
  parent_group_id: number | null;
  subgroup_id: number | null;
  parent_group_code: string | null;
  subgroup_code: string | null;
};

type UnmappableItem = {
  table: string;
  key: string;
  details: string;
};

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isSupportedSystemId = (value: string): value is SupportedSystemId =>
  (SUPPORTED_SYSTEMS as readonly string[]).includes(value);

const isExchangeGroupCode = (value: string): value is ExchangeGroupCode =>
  (GROUP_CODES as readonly string[]).includes(value);

const isExchangeSubgroupCode = (value: string): value is ExchangeSubgroupCode =>
  (SUBGROUP_CODES as readonly string[]).includes(value);

const resolveNutritionSystemMap = (
  rows: NutritionSystemRow[],
): Map<SupportedSystemId, number> => {
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

const failIfUnsupportedSystemsAreActive = async (): Promise<void> => {
  const result = await nutritionPool.query<{ id: string }>(
    `
      SELECT id
      FROM ${appSchema}.exchange_systems
      WHERE is_active = true;
    `,
  );

  const unsupported = result.rows
    .map((row) => row.id)
    .filter((id) => !isSupportedSystemId(id));

  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported active systems found: ${unsupported.join(', ')}. Deactivate them before running backfill.`,
    );
  }
};

const run = async (): Promise<void> => {
  await failIfUnsupportedSystemsAreActive();

  const nutritionSystems = await nutritionPool.query<NutritionSystemRow>(
    `
      SELECT id, name
      FROM ${nutritionSchema}.exchange_systems
      ORDER BY id ASC;
    `,
  );

  const nutritionSystemIdByApp = resolveNutritionSystemMap(nutritionSystems.rows);
  const appSystemIdByNutrition = new Map<number, SupportedSystemId>(
    Array.from(nutritionSystemIdByApp.entries()).map(([appSystemId, nutritionId]) => [nutritionId, appSystemId]),
  );
  const nutritionSystemIds = Array.from(appSystemIdByNutrition.keys());

  const [groupRows, subgroupRows] = await Promise.all([
    nutritionPool.query<NutritionGroupRow>(
      `
        SELECT id, system_id, name
        FROM ${nutritionSchema}.exchange_groups
        WHERE system_id = ANY($1::int[])
        ORDER BY system_id ASC, id ASC;
      `,
      [nutritionSystemIds],
    ),
    nutritionPool.query<NutritionSubgroupRow>(
      `
        SELECT
          es.id,
          eg.system_id,
          es.exchange_group_id,
          es.name,
          eg.name AS parent_group_name
        FROM ${nutritionSchema}.exchange_subgroups es
        JOIN ${nutritionSchema}.exchange_groups eg
          ON eg.id = es.exchange_group_id
        WHERE eg.system_id = ANY($1::int[])
        ORDER BY eg.system_id ASC, es.id ASC;
      `,
      [nutritionSystemIds],
    ),
  ]);

  const groupIdByCodeBySystem = new Map<SupportedSystemId, Map<ExchangeGroupCode, number>>();
  for (const row of groupRows.rows) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;

    const groupCode = inferGroupCodeFromText(row.name);
    const map = groupIdByCodeBySystem.get(appSystemId) ?? new Map<ExchangeGroupCode, number>();
    if (!map.has(groupCode)) {
      map.set(groupCode, row.id);
    }
    groupIdByCodeBySystem.set(appSystemId, map);
  }

  const subgroupIdByCodeBySystem = new Map<SupportedSystemId, Map<ExchangeSubgroupCode, number>>();
  const parentGroupIdBySubgroupId = new Map<number, number>();
  for (const row of subgroupRows.rows) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;

    const parentGroupCode = inferGroupCodeFromText(row.parent_group_name);
    const subgroupCode = inferSubgroupCodeFromText(row.name, parentGroupCode);
    if (!subgroupCode) continue;

    const expectedParent = SUBGROUP_PARENT_BY_CODE[subgroupCode];
    if (expectedParent !== parentGroupCode) {
      continue;
    }

    const map = subgroupIdByCodeBySystem.get(appSystemId) ?? new Map<ExchangeSubgroupCode, number>();
    if (!map.has(subgroupCode)) {
      map.set(subgroupCode, row.id);
    }
    subgroupIdByCodeBySystem.set(appSystemId, map);
    parentGroupIdBySubgroupId.set(row.id, row.exchange_group_id);
  }

  const client = await nutritionPool.connect();
  const unmappable: UnmappableItem[] = [];

  let groupsInserted = 0;
  let subgroupsInserted = 0;
  let overridesUpdated = 0;
  let policiesUpdated = 0;
  let rulesUpdated = 0;

  try {
    await client.query('BEGIN');

    const legacyGroups = await client.query<LegacyGroupRow>(
      `
        SELECT system_id, group_code, display_name_es
        FROM ${appSchema}.exchange_groups
        WHERE system_id = ANY($1::text[])
        ORDER BY system_id ASC, id ASC;
      `,
      [SUPPORTED_SYSTEMS],
    );

    for (const row of legacyGroups.rows) {
      if (!isSupportedSystemId(row.system_id) || !isExchangeGroupCode(row.group_code)) {
        continue;
      }

      const nutritionSystemId = nutritionSystemIdByApp.get(row.system_id);
      if (!nutritionSystemId) continue;

      const map = groupIdByCodeBySystem.get(row.system_id) ?? new Map<ExchangeGroupCode, number>();
      const groupCode = row.group_code;

      if (map.has(groupCode)) {
        groupIdByCodeBySystem.set(row.system_id, map);
        continue;
      }

      const insert = await client.query<{ id: number }>(
        `
          INSERT INTO ${nutritionSchema}.exchange_groups (system_id, name)
          VALUES ($1, $2)
          RETURNING id;
        `,
        [nutritionSystemId, row.display_name_es],
      );

      const groupId = insert.rows[0]?.id;
      if (!groupId) {
        throw new Error(`Failed to insert nutrition.exchange_groups for ${row.system_id}:${groupCode}`);
      }

      map.set(groupCode, groupId);
      groupIdByCodeBySystem.set(row.system_id, map);
      groupsInserted += 1;
    }

    const legacySubgroups = await client.query<LegacySubgroupRow>(
      `
        SELECT
          es.system_id,
          eg.group_code AS parent_group_code,
          es.subgroup_code,
          es.display_name_es
        FROM ${appSchema}.exchange_subgroups es
        JOIN ${appSchema}.exchange_groups eg
          ON eg.id = es.parent_group_id
        WHERE es.system_id = ANY($1::text[])
          AND es.is_active = true
        ORDER BY es.system_id ASC, es.id ASC;
      `,
      [SUPPORTED_SYSTEMS],
    );

    for (const row of legacySubgroups.rows) {
      if (
        !isSupportedSystemId(row.system_id) ||
        !isExchangeGroupCode(row.parent_group_code) ||
        !isExchangeSubgroupCode(row.subgroup_code)
      ) {
        continue;
      }

      const groupMap = groupIdByCodeBySystem.get(row.system_id);
      if (!groupMap) {
        unmappable.push({
          table: 'exchange_subgroups',
          key: `${row.system_id}:${row.subgroup_code}`,
          details: 'No group map found for system',
        });
        continue;
      }

      const parentGroupId = groupMap.get(row.parent_group_code);
      if (!parentGroupId) {
        unmappable.push({
          table: 'exchange_subgroups',
          key: `${row.system_id}:${row.subgroup_code}`,
          details: `No nutrition group id for parent_group_code=${row.parent_group_code}`,
        });
        continue;
      }

      const subgroupMap = subgroupIdByCodeBySystem.get(row.system_id) ?? new Map<ExchangeSubgroupCode, number>();
      const existingSubgroupId = subgroupMap.get(row.subgroup_code);
      const existingParentGroupId = existingSubgroupId
        ? parentGroupIdBySubgroupId.get(existingSubgroupId) ?? null
        : null;

      if (existingSubgroupId && existingParentGroupId === parentGroupId) {
        subgroupIdByCodeBySystem.set(row.system_id, subgroupMap);
        continue;
      }

      const insert = await client.query<{ id: number }>(
        `
          INSERT INTO ${nutritionSchema}.exchange_subgroups (exchange_group_id, name)
          VALUES ($1, $2)
          RETURNING id;
        `,
        [parentGroupId, row.display_name_es],
      );

      const subgroupId = insert.rows[0]?.id;
      if (!subgroupId) {
        throw new Error(
          `Failed to insert nutrition.exchange_subgroups for ${row.system_id}:${row.subgroup_code}`,
        );
      }

      subgroupMap.set(row.subgroup_code, subgroupId);
      subgroupIdByCodeBySystem.set(row.system_id, subgroupMap);
      parentGroupIdBySubgroupId.set(subgroupId, parentGroupId);
      subgroupsInserted += 1;
    }

    const foodOverrides = await client.query<FoodOverrideRow>(
      `
        SELECT
          feo.food_id,
          feo.system_id,
          feo.group_id,
          feo.subgroup_id,
          eg.group_code,
          es.subgroup_code
        FROM ${appSchema}.food_exchange_overrides feo
        LEFT JOIN ${appSchema}.exchange_groups eg
          ON eg.id = feo.exchange_group_id
        LEFT JOIN ${appSchema}.exchange_subgroups es
          ON es.id = feo.exchange_subgroup_id
        WHERE feo.is_active = true;
      `,
    );

    for (const row of foodOverrides.rows) {
      if (!isSupportedSystemId(row.system_id)) continue;

      const groupMap = groupIdByCodeBySystem.get(row.system_id);
      const subgroupMap = subgroupIdByCodeBySystem.get(row.system_id);

      const mappedSubgroupId =
        row.subgroup_id ??
        (row.subgroup_code && isExchangeSubgroupCode(row.subgroup_code)
          ? subgroupMap?.get(row.subgroup_code) ?? null
          : null);

      const mappedGroupId =
        row.group_id ??
        (mappedSubgroupId
          ? parentGroupIdBySubgroupId.get(mappedSubgroupId) ?? null
          : row.group_code && isExchangeGroupCode(row.group_code)
            ? groupMap?.get(row.group_code) ?? null
            : null);

      if (mappedGroupId === null) {
        unmappable.push({
          table: 'food_exchange_overrides',
          key: `${row.system_id}:${row.food_id}`,
          details: `group_code=${row.group_code ?? 'NULL'} subgroup_code=${row.subgroup_code ?? 'NULL'}`,
        });
        continue;
      }

      if (row.group_id !== mappedGroupId || row.subgroup_id !== mappedSubgroupId) {
        await client.query(
          `
            UPDATE ${appSchema}.food_exchange_overrides
            SET group_id = $1, subgroup_id = $2
            WHERE food_id = $3
              AND system_id = $4;
          `,
          [mappedGroupId, mappedSubgroupId, row.food_id, row.system_id],
        );
        overridesUpdated += 1;
      }
    }

    const policyRows = await client.query<PolicyRow>(
      `
        SELECT id::text, system_id, subgroup_id, subgroup_code
        FROM ${appSchema}.subgroup_selection_policies
        WHERE is_active = true;
      `,
    );

    for (const row of policyRows.rows) {
      if (!isSupportedSystemId(row.system_id)) continue;

      const subgroupMap = subgroupIdByCodeBySystem.get(row.system_id);
      const mappedSubgroupId =
        row.subgroup_id ??
        (row.subgroup_code && isExchangeSubgroupCode(row.subgroup_code)
          ? subgroupMap?.get(row.subgroup_code) ?? null
          : null);

      if (mappedSubgroupId === null) {
        unmappable.push({
          table: 'subgroup_selection_policies',
          key: row.id,
          details: `system_id=${row.system_id} subgroup_code=${row.subgroup_code ?? 'NULL'}`,
        });
        continue;
      }

      if (row.subgroup_id !== mappedSubgroupId) {
        await client.query(
          `
            UPDATE ${appSchema}.subgroup_selection_policies
            SET subgroup_id = $1
            WHERE id = $2::bigint;
          `,
          [mappedSubgroupId, row.id],
        );
        policiesUpdated += 1;
      }
    }

    const ruleRows = await client.query<RuleRow>(
      `
        SELECT
          id::text,
          system_id,
          parent_group_id,
          subgroup_id,
          parent_group_code,
          subgroup_code
        FROM ${appSchema}.subgroup_classification_rules
        WHERE is_active = true;
      `,
    );

    for (const row of ruleRows.rows) {
      if (!isSupportedSystemId(row.system_id)) continue;

      const groupMap = groupIdByCodeBySystem.get(row.system_id);
      const subgroupMap = subgroupIdByCodeBySystem.get(row.system_id);

      const mappedSubgroupId =
        row.subgroup_id ??
        (row.subgroup_code && isExchangeSubgroupCode(row.subgroup_code)
          ? subgroupMap?.get(row.subgroup_code) ?? null
          : null);

      const mappedParentGroupId =
        row.parent_group_id ??
        (mappedSubgroupId
          ? parentGroupIdBySubgroupId.get(mappedSubgroupId) ?? null
          : row.parent_group_code && isExchangeGroupCode(row.parent_group_code)
            ? groupMap?.get(row.parent_group_code) ?? null
            : null);

      if (mappedSubgroupId === null || mappedParentGroupId === null) {
        unmappable.push({
          table: 'subgroup_classification_rules',
          key: row.id,
          details: `system_id=${row.system_id} parent_group_code=${row.parent_group_code ?? 'NULL'} subgroup_code=${row.subgroup_code ?? 'NULL'}`,
        });
        continue;
      }

      if (row.subgroup_id !== mappedSubgroupId || row.parent_group_id !== mappedParentGroupId) {
        await client.query(
          `
            UPDATE ${appSchema}.subgroup_classification_rules
            SET parent_group_id = $1, subgroup_id = $2
            WHERE id = $3::bigint;
          `,
          [mappedParentGroupId, mappedSubgroupId, row.id],
        );
        rulesUpdated += 1;
      }
    }

    if (unmappable.length > 0) {
      const details = unmappable
        .slice(0, 20)
        .map((item) => `${item.table}[${item.key}] -> ${item.details}`)
        .join('\n');

      throw new Error(`Backfill aborted: ${unmappable.length} active rows are unmappable.\n${details}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(
    [
      'Backfill completed.',
      `nutrition.exchange_groups inserted: ${groupsInserted}`,
      `nutrition.exchange_subgroups inserted: ${subgroupsInserted}`,
      `food_exchange_overrides updated: ${overridesUpdated}`,
      `subgroup_selection_policies updated: ${policiesUpdated}`,
      `subgroup_classification_rules updated: ${rulesUpdated}`,
    ].join('\n'),
  );
};

run()
  .then(async () => {
    await nutritionPool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await nutritionPool.end();
    process.exit(1);
  });
