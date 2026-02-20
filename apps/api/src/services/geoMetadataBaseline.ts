import type { PrismaClient } from '@prisma/client';
import type { ExchangeSystemId } from '@equivalentes/shared';
import type { QueryResultRow } from 'pg';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const SUPPORTED_SYSTEMS = ['mx_smae', 'us_usda', 'es_exchange', 'ar_exchange'] as const;
type SupportedSystemId = (typeof SUPPORTED_SYSTEMS)[number];

const SYSTEM_NAME_MATCHERS: Record<SupportedSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'united states', 'usa'],
  es_exchange: ['bedca', 'espanola', 'espana', 'spain', 'es exchange', 'es_exchange'],
  ar_exchange: ['argenfoods', 'argentina', 'ar exchange', 'ar_exchange'],
};

type AppSystemRow = {
  id: string;
  country_code: string;
};

type NutritionSystemRow = {
  id: number;
  name: string;
};

export type GeoMetadataSyncResult = {
  systemId: ExchangeSystemId;
  countryCode: string;
  nutritionSystemId: number;
  deletedRows: number;
  insertedRows: number;
};

type QueryRowsFn = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

type ExecuteFn = (sql: string, params?: unknown[]) => Promise<number>;

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isSupportedSystemId = (value: string): value is SupportedSystemId =>
  (SUPPORTED_SYSTEMS as readonly string[]).includes(value);

const resolveNutritionSystemId = (
  appSystemId: SupportedSystemId,
  nutritionSystems: NutritionSystemRow[],
): number => {
  const keywords = SYSTEM_NAME_MATCHERS[appSystemId];
  const match = nutritionSystems.find((row) => {
    const normalizedName = normalize(row.name);
    return keywords.some((keyword) => normalizedName.includes(normalize(keyword)));
  });

  if (!match) {
    throw new Error(`No nutrition.exchange_systems match found for ${appSystemId}`);
  }

  return match.id;
};

const toRowCount = (value: number | bigint): number =>
  typeof value === 'bigint' ? Number(value) : value;

const syncGeoMetadataBaselineInternal = async (
  queryRows: QueryRowsFn,
  execute: ExecuteFn,
): Promise<GeoMetadataSyncResult[]> => {
  const [appSystems, nutritionSystems] = await Promise.all([
    queryRows<AppSystemRow>(
      `
        SELECT id, country_code
        FROM ${appSchema}.exchange_systems
        WHERE is_active = true
        ORDER BY id ASC;
      `,
    ),
    queryRows<NutritionSystemRow>(
      `
        SELECT id, name
        FROM ${nutritionSchema}.exchange_systems
        ORDER BY id ASC;
      `,
    ),
  ]);

  const targetSystems = appSystems.flatMap((row) => {
    const systemId = row.id;
    if (!isSupportedSystemId(systemId)) {
      return [];
    }

    return [{
      systemId,
      countryCode: row.country_code.trim().toUpperCase(),
      nutritionSystemId: resolveNutritionSystemId(systemId, nutritionSystems),
    }];
  });

  const results: GeoMetadataSyncResult[] = [];
  for (const system of targetSystems) {
    const deletedRows = await execute(
      `
        DELETE FROM ${appSchema}.food_geo_weights fg
        USING ${nutritionSchema}.foods f
        JOIN ${nutritionSchema}.exchange_groups eg
          ON eg.id = f.exchange_group_id
        WHERE fg.food_id = f.id
          AND eg.system_id = $1
          AND fg.country_code = $2
          AND fg.source = 'system_baseline';
      `,
      [system.nutritionSystemId, system.countryCode],
    );

    const insertedRows = await execute(
      `
        INSERT INTO ${appSchema}.food_geo_weights (
          food_id,
          country_code,
          state_code,
          weight,
          source
        )
        SELECT
          f.id,
          $2::char(2),
          NULL,
          1,
          'system_baseline'
        FROM ${nutritionSchema}.foods f
        JOIN ${nutritionSchema}.exchange_groups eg
          ON eg.id = f.exchange_group_id
        WHERE eg.system_id = $1;
      `,
      [system.nutritionSystemId, system.countryCode],
    );

    results.push({
      systemId: system.systemId,
      countryCode: system.countryCode,
      nutritionSystemId: system.nutritionSystemId,
      deletedRows,
      insertedRows,
    });
  }

  return results;
};

export const syncGeoMetadataBaseline = async (): Promise<GeoMetadataSyncResult[]> =>
  syncGeoMetadataBaselineInternal(
    async <T extends QueryResultRow>(sql: string, params?: unknown[]) => {
      const result = await nutritionPool.query<T>(sql, params);
      return result.rows;
    },
    async (sql: string, params?: unknown[]) => {
      const result = await nutritionPool.query(sql, params);
      return result.rowCount ?? 0;
    },
  );

export const syncGeoMetadataBaselineWithPrisma = async (
  prisma: PrismaClient,
): Promise<GeoMetadataSyncResult[]> =>
  syncGeoMetadataBaselineInternal(
    async <T extends QueryResultRow>(sql: string, params?: unknown[]) => {
      const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...(params ?? []));
      return rows;
    },
    async (sql: string, params?: unknown[]) => {
      const affected = await prisma.$executeRawUnsafe(sql, ...(params ?? []));
      return toRowCount(affected);
    },
  );
