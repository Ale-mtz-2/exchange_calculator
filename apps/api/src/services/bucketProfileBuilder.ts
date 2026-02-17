import type { ExchangeGroupCode, ExchangeSystemId, FoodItemV2 } from '@equivalentes/shared';
import { EXCHANGE_SYSTEMS } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';
import { inferGroupCodeFromText, inferSubgroupCodeFromText } from './groupCodeMapper.js';
import { loadFoodsForSystemIdV2 } from './nutritionCatalogV2.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const round = (value: number, digits = 2): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

type AggregateAccumulator = {
  parentGroupId: number | null;
  count: number;
  choSum: number;
  proSum: number;
  fatSum: number;
  kcalSum: number;
};

export type ExchangeBucketProfileRow = {
  profileVersion: string;
  systemId: ExchangeSystemId;
  bucketType: 'group' | 'subgroup';
  bucketId: number;
  parentGroupId: number | null;
  choG: number;
  proG: number;
  fatG: number;
  kcal: number;
  sampleSize: number;
  bucketName: string;
  legacyCode?: string;
};

const upsertBucketProfile = async (row: ExchangeBucketProfileRow): Promise<void> => {
  await nutritionPool.query(
    `
      INSERT INTO ${appSchema}.exchange_bucket_profiles (
        profile_version,
        system_id,
        bucket_type,
        bucket_id,
        parent_group_id,
        cho_g,
        pro_g,
        fat_g,
        kcal,
        sample_size
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (profile_version, system_id, bucket_type, bucket_id)
      DO UPDATE SET
        parent_group_id = EXCLUDED.parent_group_id,
        cho_g = EXCLUDED.cho_g,
        pro_g = EXCLUDED.pro_g,
        fat_g = EXCLUDED.fat_g,
        kcal = EXCLUDED.kcal,
        sample_size = EXCLUDED.sample_size;
    `,
    [
      row.profileVersion,
      row.systemId,
      row.bucketType,
      row.bucketId,
      row.parentGroupId,
      row.choG,
      row.proG,
      row.fatG,
      row.kcal,
      row.sampleSize,
    ],
  );
};

const toProfileRow = (
  profileVersion: string,
  systemId: ExchangeSystemId,
  bucketType: 'group' | 'subgroup',
  bucketId: number,
  bucketName: string,
  parentGroupId: number | null,
  parentGroupCode: ExchangeGroupCode | undefined,
  stats: AggregateAccumulator,
): ExchangeBucketProfileRow => {
  const choG = round(stats.choSum / stats.count);
  const proG = round(stats.proSum / stats.count);
  const fatG = round(stats.fatSum / stats.count);
  const kcal = Math.max(0, Math.round(stats.kcalSum / stats.count));

  const legacyCode = bucketType === 'subgroup'
    ? inferSubgroupCodeFromText(bucketName, parentGroupCode)
    : inferGroupCodeFromText(bucketName);

  return {
    profileVersion,
    systemId,
    bucketType,
    bucketId,
    parentGroupId,
    choG,
    proG,
    fatG,
    kcal,
    sampleSize: stats.count,
    bucketName,
    ...(legacyCode ? { legacyCode } : {}),
  };
};

const aggregateProfiles = (
  profileVersion: string,
  systemId: ExchangeSystemId,
  foods: FoodItemV2[],
  groupNameById: Map<number, string>,
  subgroupMetaById: Map<number, { name: string; parentGroupId: number }>,
): ExchangeBucketProfileRow[] => {
  const groups = new Map<number, AggregateAccumulator>();
  const subgroups = new Map<number, AggregateAccumulator>();

  for (const food of foods) {
    const groupStats = groups.get(food.groupId) ?? {
      parentGroupId: null,
      count: 0,
      choSum: 0,
      proSum: 0,
      fatSum: 0,
      kcalSum: 0,
    };
    groupStats.count += 1;
    groupStats.choSum += food.carbsG;
    groupStats.proSum += food.proteinG;
    groupStats.fatSum += food.fatG;
    groupStats.kcalSum += food.caloriesKcal;
    groups.set(food.groupId, groupStats);

    if (typeof food.subgroupId === 'number') {
      const subgroupStats = subgroups.get(food.subgroupId) ?? {
        parentGroupId: food.groupId,
        count: 0,
        choSum: 0,
        proSum: 0,
        fatSum: 0,
        kcalSum: 0,
      };
      subgroupStats.count += 1;
      subgroupStats.choSum += food.carbsG;
      subgroupStats.proSum += food.proteinG;
      subgroupStats.fatSum += food.fatG;
      subgroupStats.kcalSum += food.caloriesKcal;
      subgroups.set(food.subgroupId, subgroupStats);
    }
  }

  const rows: ExchangeBucketProfileRow[] = [];

  for (const [groupId, stats] of groups.entries()) {
    const groupName = groupNameById.get(groupId) ?? `Grupo ${groupId}`;
    rows.push(
      toProfileRow(profileVersion, systemId, 'group', groupId, groupName, null, undefined, stats),
    );
  }

  for (const [subgroupId, stats] of subgroups.entries()) {
    const subgroup = subgroupMetaById.get(subgroupId);
    const subgroupName = subgroup?.name ?? `Subgrupo ${subgroupId}`;
    const parentGroupId = subgroup?.parentGroupId ?? stats.parentGroupId;
    const parentGroupName = parentGroupId === null ? null : (groupNameById.get(parentGroupId) ?? null);
    const parentGroupCode = parentGroupName ? inferGroupCodeFromText(parentGroupName) : undefined;
    rows.push(
      toProfileRow(
        profileVersion,
        systemId,
        'subgroup',
        subgroupId,
        subgroupName,
        parentGroupId,
        parentGroupCode,
        stats,
      ),
    );
  }

  return rows;
};

export const rebuildBucketProfilesForSystem = async (
  profileVersion: string,
  systemId: ExchangeSystemId,
): Promise<{ systemId: ExchangeSystemId; rows: number }> => {
  const { foods, groupsById, subgroupsById } = await loadFoodsForSystemIdV2(systemId);
  const groupNameById = new Map<number, string>();
  for (const [id, meta] of groupsById.entries()) {
    groupNameById.set(id, meta.name);
  }

  const subgroupMetaById = new Map<number, { name: string; parentGroupId: number }>();
  for (const [id, meta] of subgroupsById.entries()) {
    subgroupMetaById.set(id, { name: meta.name, parentGroupId: meta.parentGroupId });
  }

  const rows = aggregateProfiles(profileVersion, systemId, foods, groupNameById, subgroupMetaById);

  await nutritionPool.query(
    `
      DELETE FROM ${appSchema}.exchange_bucket_profiles
      WHERE profile_version = $1
        AND system_id = $2;
    `,
    [profileVersion, systemId],
  );

  for (const row of rows) {
    await upsertBucketProfile(row);
  }

  return { systemId, rows: rows.length };
};

export const rebuildBucketProfiles = async (
  profileVersion: string,
  selectedSystem?: ExchangeSystemId,
): Promise<Array<{ systemId: ExchangeSystemId; rows: number }>> => {
  const systems = selectedSystem
    ? [selectedSystem]
    : EXCHANGE_SYSTEMS.map((system) => system.id);

  const results: Array<{ systemId: ExchangeSystemId; rows: number }> = [];
  for (const systemId of systems) {
    const result = await rebuildBucketProfilesForSystem(profileVersion, systemId);
    results.push(result);
  }

  return results;
};

export const getLatestBucketProfileVersion = async (
  systemId: ExchangeSystemId,
): Promise<string | null> => {
  const result = await nutritionPool.query<{ profile_version: string }>(
    `
      SELECT profile_version
      FROM ${appSchema}.exchange_bucket_profiles
      WHERE system_id = $1
      ORDER BY created_at DESC, profile_version DESC
      LIMIT 1;
    `,
    [systemId],
  );

  return result.rows[0]?.profile_version ?? null;
};

export const loadBucketProfiles = async (
  systemId: ExchangeSystemId,
  profileVersion: string,
): Promise<ExchangeBucketProfileRow[]> => {
  const result = await nutritionPool.query<{
    profile_version: string;
    system_id: string;
    bucket_type: 'group' | 'subgroup';
    bucket_id: number;
    parent_group_id: number | null;
    cho_g: number;
    pro_g: number;
    fat_g: number;
    kcal: number;
    sample_size: number;
      bucket_name: string;
      parent_group_name: string | null;
  }>(
    `
      SELECT
        bp.profile_version,
        bp.system_id,
        bp.bucket_type,
        bp.bucket_id,
        bp.parent_group_id,
        bp.cho_g::float8,
        bp.pro_g::float8,
        bp.fat_g::float8,
        bp.kcal,
        bp.sample_size,
        COALESCE(eg.name, es.name) AS bucket_name,
        pg.name AS parent_group_name
      FROM ${appSchema}.exchange_bucket_profiles bp
      LEFT JOIN ${nutritionSchema}.exchange_groups eg
        ON bp.bucket_type = 'group'
       AND eg.id = bp.bucket_id
      LEFT JOIN ${nutritionSchema}.exchange_subgroups es
        ON bp.bucket_type = 'subgroup'
       AND es.id = bp.bucket_id
      LEFT JOIN ${nutritionSchema}.exchange_groups pg
        ON pg.id = bp.parent_group_id
      WHERE bp.system_id = $1
        AND bp.profile_version = $2
      ORDER BY bp.bucket_type, bp.bucket_id;
    `,
    [systemId, profileVersion],
  );

  return result.rows.map((row) => {
    const bucketName = row.bucket_name ?? `${row.bucket_type}:${row.bucket_id}`;
    const parentGroupCode = row.parent_group_name
      ? inferGroupCodeFromText(row.parent_group_name)
      : undefined;
    const legacyCode = row.bucket_type === 'subgroup'
      ? inferSubgroupCodeFromText(bucketName, parentGroupCode)
      : inferGroupCodeFromText(bucketName);

    return {
      profileVersion: row.profile_version,
      systemId,
      bucketType: row.bucket_type,
      bucketId: row.bucket_id,
      parentGroupId: row.parent_group_id,
      choG: row.cho_g,
      proG: row.pro_g,
      fatG: row.fat_g,
      kcal: row.kcal,
      sampleSize: row.sample_size,
      bucketName,
      ...(legacyCode ? { legacyCode } : {}),
    };
  });
};
