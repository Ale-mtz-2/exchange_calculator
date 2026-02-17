import {
  COUNTRY_OPTIONS,
  COUNTRY_STATES,
  KCAL_FORMULAS,
} from '@equivalentes/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { nutritionPool } from '../db/pg.js';
import { inferGroupCodeFromText, inferSubgroupCodeFromText } from './groupCodeMapper.js';
import { safeSchema } from '../utils/sql.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const OPTIONS_TTL_MS = 5 * 60 * 1000;
let cachedOptions: Record<string, unknown> | null = null;
let cacheTimestamp = 0;

const SUPPORTED_SYSTEMS = ['mx_smae', 'us_usda'] as const;
type SupportedSystemId = (typeof SUPPORTED_SYSTEMS)[number];

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
  avg_calories: number | null;
};

type NutritionSubgroupRow = {
  id: number;
  system_id: number;
  parent_group_id: number;
  name: string;
  parent_group_name: string;
};

type BucketProfileRow = {
  system_id: string;
  bucket_type: 'group' | 'subgroup';
  bucket_id: number;
  cho_g: number;
  pro_g: number;
  fat_g: number;
  kcal: number;
};

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const resolveNutritionSystemMap = (
  rows: NutritionSystemRow[],
): Map<SupportedSystemId, number> => {
  const map = new Map<SupportedSystemId, number>();

  for (const appSystemId of SUPPORTED_SYSTEMS) {
    const candidates = SYSTEM_NAME_MATCHERS[appSystemId];
    const match = rows.find((row) => {
      const name = normalize(row.name);
      return candidates.some((token) => name.includes(normalize(token)));
    });

    if (!match) {
      throw new Error(`No nutrition.exchange_systems match found for ${appSystemId}`);
    }

    map.set(appSystemId, match.id);
  }

  return map;
};

const fetchOptions = async (): Promise<Record<string, unknown>> => {
  const [dbFormulas, dbSystems, dbPolicies, dbStates, nutritionSystems] = await Promise.all([
    prisma.kcalFormula.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.exchangeSystem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.subgroupSelectionPolicy.findMany({
      where: { isActive: true, subgroupId: { not: null } },
      orderBy: [{ systemId: 'asc' }, { goal: 'asc' }, { dietPattern: 'asc' }, { subgroupId: 'asc' }],
    }),
    prisma.countryState.findMany({ orderBy: [{ countryCode: 'asc' }, { stateName: 'asc' }] }),
    nutritionPool.query<NutritionSystemRow>(
      `
        SELECT id, name
        FROM ${nutritionSchema}.exchange_systems
        ORDER BY id ASC;
      `,
    ),
  ]);

  const unsupportedActive = dbSystems.filter(
    (system) => !(SUPPORTED_SYSTEMS as readonly string[]).includes(system.id),
  );
  if (unsupportedActive.length > 0) {
    const ids = unsupportedActive.map((system) => system.id).join(', ');
    throw new Error(
      `Unsupported active systems found in equivalentes_app.exchange_systems: ${ids}. Deactivate them before hardcut.`,
    );
  }

  const systems = dbSystems.filter((system): system is typeof system & { id: SupportedSystemId } =>
    (SUPPORTED_SYSTEMS as readonly string[]).includes(system.id),
  );

  const nutritionSystemIdByApp = resolveNutritionSystemMap(nutritionSystems.rows);
  const appSystemIdByNutrition = new Map<number, SupportedSystemId>(
    Array.from(nutritionSystemIdByApp.entries()).map(([appSystemId, nutritionSystemId]) => [nutritionSystemId, appSystemId]),
  );
  const nutritionSystemIds = Array.from(appSystemIdByNutrition.keys());

  const [nutritionGroups, nutritionSubgroups, latestProfiles] = await Promise.all([
    nutritionPool.query<NutritionGroupRow>(
      `
        SELECT
          eg.id,
          eg.system_id,
          eg.name,
          eg.avg_calories
        FROM ${nutritionSchema}.exchange_groups eg
        WHERE eg.system_id = ANY($1::int[])
        ORDER BY eg.system_id ASC, eg.id ASC;
      `,
      [nutritionSystemIds],
    ),
    nutritionPool.query<NutritionSubgroupRow>(
      `
        SELECT
          es.id,
          eg.system_id,
          es.exchange_group_id AS parent_group_id,
          es.name,
          eg.name AS parent_group_name
        FROM ${nutritionSchema}.exchange_subgroups es
        JOIN ${nutritionSchema}.exchange_groups eg
          ON eg.id = es.exchange_group_id
        WHERE eg.system_id = ANY($1::int[])
        ORDER BY eg.system_id ASC, es.exchange_group_id ASC, es.id ASC;
      `,
      [nutritionSystemIds],
    ),
    nutritionPool.query<BucketProfileRow>(
      `
        WITH latest AS (
          SELECT system_id, MAX(profile_version) AS profile_version
          FROM ${appSchema}.exchange_bucket_profiles
          WHERE system_id = ANY($1::text[])
          GROUP BY system_id
        )
        SELECT
          bp.system_id,
          bp.bucket_type,
          bp.bucket_id,
          bp.cho_g::float8,
          bp.pro_g::float8,
          bp.fat_g::float8,
          bp.kcal
        FROM ${appSchema}.exchange_bucket_profiles bp
        JOIN latest l
          ON l.system_id = bp.system_id
         AND l.profile_version = bp.profile_version;
      `,
      [systems.map((system) => system.id)],
    ),
  ]);

  const profileByKey = new Map<string, BucketProfileRow>(
    latestProfiles.rows.map((profile) => [
      `${profile.system_id}:${profile.bucket_type}:${profile.bucket_id}`,
      profile,
    ]),
  );

  const groupsBySystem: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of nutritionGroups.rows) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;

    const profile = profileByKey.get(`${appSystemId}:group:${row.id}`);
    const list = groupsBySystem[appSystemId] ?? [];
    list.push({
      id: String(row.id),
      groupCode: inferGroupCodeFromText(row.name),
      displayNameEs: row.name,
      choG: profile?.cho_g ?? 0,
      proG: profile?.pro_g ?? 0,
      fatG: profile?.fat_g ?? 0,
      kcalTarget: profile?.kcal ?? row.avg_calories ?? 0,
    });
    groupsBySystem[appSystemId] = list;
  }

  const subgroupCodeBySystemAndId = new Map<string, string>();
  const subgroupsBySystem: Record<string, Array<Record<string, unknown>>> = {};
  for (const row of nutritionSubgroups.rows) {
    const appSystemId = appSystemIdByNutrition.get(row.system_id);
    if (!appSystemId) continue;

    const parentGroupCode = inferGroupCodeFromText(row.parent_group_name);
    const subgroupCode =
      inferSubgroupCodeFromText(row.name, parentGroupCode) ?? `subgroup_${row.id}`;
    const profile = profileByKey.get(`${appSystemId}:subgroup:${row.id}`);
    const list = subgroupsBySystem[appSystemId] ?? [];
    list.push({
      id: String(row.id),
      parentGroupCode,
      subgroupCode,
      displayNameEs: row.name,
      choG: profile?.cho_g ?? 0,
      proG: profile?.pro_g ?? 0,
      fatG: profile?.fat_g ?? 0,
      kcalTarget: profile?.kcal ?? 0,
      sortOrder: row.id,
    });
    subgroupsBySystem[appSystemId] = list;
    subgroupCodeBySystemAndId.set(`${appSystemId}:${row.id}`, subgroupCode);
  }

  const formulas =
    dbFormulas.length > 0
      ? dbFormulas.map((formula) => ({
        id: formula.id,
        name: formula.name,
        description: formula.description,
      }))
      : KCAL_FORMULAS;

  const statesByCountry =
    dbStates.length > 0
      ? dbStates.reduce<Record<string, { code: string; name: string }[]>>((acc, item) => {
        const list = acc[item.countryCode] ?? [];
        list.push({ code: item.stateCode, name: item.stateName });
        acc[item.countryCode] = list;
        return acc;
      }, {})
      : COUNTRY_STATES;

  const subgroupPoliciesBySystem = dbPolicies.reduce<Record<string, Array<Record<string, unknown>>>>(
    (acc, policy) => {
      if (!policy.subgroupId) return acc;

      const list = acc[policy.systemId] ?? [];
      list.push({
        goal: policy.goal,
        dietPattern: policy.dietPattern,
        subgroupCode:
          subgroupCodeBySystemAndId.get(`${policy.systemId}:${policy.subgroupId}`) ??
          `subgroup_${policy.subgroupId}`,
        targetSharePct: Number(policy.targetSharePct),
        scoreAdjustment: Number(policy.scoreAdjustment),
      });
      acc[policy.systemId] = list;
      return acc;
    },
    {},
  );

  for (const system of systems) {
    if (!groupsBySystem[system.id] || groupsBySystem[system.id]?.length === 0) {
      throw new Error(`No nutrition groups found for active system ${system.id}`);
    }
    if (!subgroupsBySystem[system.id]) {
      subgroupsBySystem[system.id] = [];
    }
  }

  return {
    countries: COUNTRY_OPTIONS,
    statesByCountry,
    formulas,
    systems: systems.map((system) => ({
      id: system.id,
      countryCode: system.countryCode,
      name: system.name,
      source: system.source,
    })),
    groupsBySystem,
    subgroupsBySystem,
    subgroupPoliciesBySystem,
  };
};

export const getOptions = async (): Promise<Record<string, unknown>> => {
  const now = Date.now();
  if (cachedOptions && now - cacheTimestamp < OPTIONS_TTL_MS) {
    return cachedOptions;
  }

  const result = await fetchOptions();
  cachedOptions = result;
  cacheTimestamp = now;
  return result;
};
