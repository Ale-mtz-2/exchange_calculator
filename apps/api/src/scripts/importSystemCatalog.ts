import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExchangeSystemId } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiRoot = resolve(__dirname, '../..');

type SystemCatalogConfig = {
  nutritionSystemName: string;
  countryCode: string;
  dataSourceName: string;
  defaultCsvPath: string;
};

const SYSTEM_CONFIG: Record<ExchangeSystemId, SystemCatalogConfig> = {
  mx_smae: {
    nutritionSystemName: 'Sistema Mexicano de Alimentos Equivalentes (SMAE)',
    countryCode: 'MX',
    dataSourceName: 'SMAE',
    defaultCsvPath: resolve(apiRoot, 'prisma/data/smae_food_curated.approved.csv'),
  },
  us_usda: {
    nutritionSystemName: 'USDA FoodData Central',
    countryCode: 'US',
    dataSourceName: 'USDA',
    defaultCsvPath: resolve(apiRoot, 'prisma/data/catalog/us_usda.approved.csv'),
  },
  es_exchange: {
    nutritionSystemName: 'Base de Datos Espanola de Composicion de Alimentos (BEDCA)',
    countryCode: 'ES',
    dataSourceName: 'BEDCA',
    defaultCsvPath: resolve(apiRoot, 'prisma/data/catalog/es_exchange.approved.csv'),
  },
  ar_exchange: {
    nutritionSystemName: 'Tabla Argentina de Composicion de Alimentos (Argenfoods)',
    countryCode: 'AR',
    dataSourceName: 'ARGENFOODS',
    defaultCsvPath: resolve(apiRoot, 'prisma/data/catalog/ar_exchange.approved.csv'),
  },
};

type CsvCatalogRow = {
  external_id?: string;
  name: string;
  group_name: string;
  subgroup_name?: string;
  category_name?: string;
  serving_qty: number;
  serving_unit: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source_url?: string;
};

const REQUIRED_HEADERS = [
  'name',
  'group_name',
  'serving_qty',
  'serving_unit',
  'calories_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
] as const;

const parseArg = (name: string): string | undefined => {
  const exact = process.argv.find((arg) => arg === name);
  if (exact) {
    const index = process.argv.indexOf(exact);
    return process.argv[index + 1];
  }

  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const normalizeKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(field);
      const isEmpty = currentRow.every((cell) => cell.trim().length === 0);
      if (!isEmpty) {
        rows.push(currentRow);
      }
      currentRow = [];
      field = '';
      continue;
    }

    if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field);
    const isEmpty = currentRow.every((cell) => cell.trim().length === 0);
    if (!isEmpty) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const parseNumber = (value: string, label: string, rowNumber: number): number => {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${label} at CSV row ${rowNumber}: ${value}`);
  }
  return parsed;
};

const parseCatalogRows = (csvText: string): CsvCatalogRow[] => {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error('CSV file is empty or missing data rows');
  }

  const headerRow = rows[0];
  if (!headerRow) {
    throw new Error('CSV file is empty or missing headers');
  }

  const headers = headerRow.map((cell) => normalizeKey(cell));
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required CSV header: ${header}`);
    }
  }

  const getValue = (cells: string[], header: string): string => {
    const index = headers.indexOf(header);
    return index >= 0 ? (cells[index] ?? '') : '';
  };

  const parsedRows: CsvCatalogRow[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!cells) {
      continue;
    }

    const csvRowNumber = index + 1;

    const name = getValue(cells, 'name').trim();
    const groupName = getValue(cells, 'group_name').trim();
    if (!name || !groupName) {
      continue;
    }

    const servingQty = parseNumber(getValue(cells, 'serving_qty'), 'serving_qty', csvRowNumber);
    const caloriesKcal = parseNumber(getValue(cells, 'calories_kcal'), 'calories_kcal', csvRowNumber);
    const proteinG = parseNumber(getValue(cells, 'protein_g'), 'protein_g', csvRowNumber);
    const carbsG = parseNumber(getValue(cells, 'carbs_g'), 'carbs_g', csvRowNumber);
    const fatG = parseNumber(getValue(cells, 'fat_g'), 'fat_g', csvRowNumber);

    if (servingQty <= 0 || caloriesKcal < 0 || proteinG < 0 || carbsG < 0 || fatG < 0) {
      continue;
    }

    const parsedRow: CsvCatalogRow = {
      name,
      group_name: groupName,
      serving_qty: servingQty,
      serving_unit: getValue(cells, 'serving_unit').trim() || 'g',
      calories_kcal: caloriesKcal,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
    };

    const externalId = getValue(cells, 'external_id').trim();
    if (externalId) {
      parsedRow.external_id = externalId;
    }

    const subgroupName = getValue(cells, 'subgroup_name').trim();
    if (subgroupName) {
      parsedRow.subgroup_name = subgroupName;
    }

    const categoryName = getValue(cells, 'category_name').trim();
    if (categoryName) {
      parsedRow.category_name = categoryName;
    }

    const sourceUrl = getValue(cells, 'source_url').trim();
    if (sourceUrl) {
      parsedRow.source_url = sourceUrl;
    }

    parsedRows.push(parsedRow);
  }

  return parsedRows;
};

const resolveSystemId = async (config: SystemCatalogConfig): Promise<number> => {
  const existing = await nutritionPool.query<{ id: number }>(
    `
      SELECT id
      FROM ${nutritionSchema}.exchange_systems
      WHERE lower(name) = lower($1)
      LIMIT 1;
    `,
    [config.nutritionSystemName],
  );

  const currentId = existing.rows[0]?.id;
  if (currentId) {
    await nutritionPool.query(
      `
        UPDATE ${nutritionSchema}.exchange_systems
        SET country_code = $2
        WHERE id = $1;
      `,
      [currentId, config.countryCode],
    );
    return currentId;
  }

  const inserted = await nutritionPool.query<{ id: number }>(
    `
      INSERT INTO ${nutritionSchema}.exchange_systems (name, country_code)
      VALUES ($1, $2)
      RETURNING id;
    `,
    [config.nutritionSystemName, config.countryCode],
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error(`Unable to create nutrition system ${config.nutritionSystemName}`);
  }

  return row.id;
};

const resolveDataSourceId = async (name: string): Promise<number> => {
  const existing = await nutritionPool.query<{ id: number }>(
    `
      SELECT id
      FROM ${nutritionSchema}.data_sources
      WHERE lower(name) = lower($1)
      LIMIT 1;
    `,
    [name],
  );

  const currentId = existing.rows[0]?.id;
  if (currentId) {
    return currentId;
  }

  const inserted = await nutritionPool.query<{ id: number }>(
    `
      INSERT INTO ${nutritionSchema}.data_sources (name)
      VALUES ($1)
      RETURNING id;
    `,
    [name],
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error(`Unable to create data source ${name}`);
  }

  return row.id;
};

const ensureGroupResolver = (nutritionSystemId: number) => {
  const cache = new Map<string, number>();

  return async (groupName: string): Promise<number> => {
    const key = normalizeKey(groupName);
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await nutritionPool.query<{ id: number }>(
      `
        SELECT id
        FROM ${nutritionSchema}.exchange_groups
        WHERE system_id = $1
          AND lower(name) = lower($2)
        ORDER BY id ASC
        LIMIT 1;
      `,
      [nutritionSystemId, groupName],
    );

    const existingId = existing.rows[0]?.id;
    if (existingId) {
      cache.set(key, existingId);
      return existingId;
    }

    const inserted = await nutritionPool.query<{ id: number }>(
      `
        INSERT INTO ${nutritionSchema}.exchange_groups (system_id, name)
        VALUES ($1, $2)
        RETURNING id;
      `,
      [nutritionSystemId, groupName],
    );

    const row = inserted.rows[0];
    if (!row) {
      throw new Error(`Unable to create exchange group ${groupName}`);
    }

    cache.set(key, row.id);
    return row.id;
  };
};

const ensureSubgroupResolver = () => {
  const cache = new Map<string, number>();

  return async (groupId: number, subgroupName?: string): Promise<number | null> => {
    if (!subgroupName) return null;

    const key = `${groupId}:${normalizeKey(subgroupName)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await nutritionPool.query<{ id: number }>(
      `
        SELECT id
        FROM ${nutritionSchema}.exchange_subgroups
        WHERE exchange_group_id = $1
          AND lower(name) = lower($2)
        ORDER BY id ASC
        LIMIT 1;
      `,
      [groupId, subgroupName],
    );

    const existingId = existing.rows[0]?.id;
    if (existingId) {
      cache.set(key, existingId);
      return existingId;
    }

    const inserted = await nutritionPool.query<{ id: number }>(
      `
        INSERT INTO ${nutritionSchema}.exchange_subgroups (exchange_group_id, name)
        VALUES ($1, $2)
        RETURNING id;
      `,
      [groupId, subgroupName],
    );

    const row = inserted.rows[0];
    if (!row) {
      throw new Error(`Unable to create exchange subgroup ${subgroupName}`);
    }

    cache.set(key, row.id);
    return row.id;
  };
};

const ensureCategoryResolver = () => {
  const cache = new Map<string, number>();

  return async (categoryName: string): Promise<number> => {
    const key = normalizeKey(categoryName);
    const cached = cache.get(key);
    if (cached) return cached;

    const existing = await nutritionPool.query<{ id: number }>(
      `
        SELECT id
        FROM ${nutritionSchema}.food_categories
        WHERE lower(name) = lower($1)
        ORDER BY id ASC
        LIMIT 1;
      `,
      [categoryName],
    );

    const existingId = existing.rows[0]?.id;
    if (existingId) {
      cache.set(key, existingId);
      return existingId;
    }

    const inserted = await nutritionPool.query<{ id: number }>(
      `
        INSERT INTO ${nutritionSchema}.food_categories (name)
        VALUES ($1)
        RETURNING id;
      `,
      [categoryName],
    );

    const row = inserted.rows[0];
    if (!row) {
      throw new Error(`Unable to create food category ${categoryName}`);
    }

    cache.set(key, row.id);
    return row.id;
  };
};

const upsertFood = async (params: {
  name: string;
  categoryId: number;
  groupId: number;
  subgroupId: number | null;
}): Promise<number> => {
  const result = await nutritionPool.query<{ id: number }>(
    `
      INSERT INTO ${nutritionSchema}.foods (
        name,
        category_id,
        exchange_group_id,
        exchange_subgroup_id,
        is_recipe
      )
      VALUES ($1, $2, $3, $4, false)
      ON CONFLICT (name, exchange_group_id, category_id)
      DO UPDATE SET
        exchange_subgroup_id = COALESCE(EXCLUDED.exchange_subgroup_id, foods.exchange_subgroup_id)
      RETURNING id;
    `,
    [params.name, params.categoryId, params.groupId, params.subgroupId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Unable to upsert food ${params.name}`);
  }

  return row.id;
};

const upsertNutritionValues = async (params: {
  foodId: number;
  dataSourceId: number;
  row: CsvCatalogRow;
}): Promise<void> => {
  const notesParts = [
    params.row.external_id ? `external_id=${params.row.external_id}` : null,
    params.row.source_url ? `source_url=${params.row.source_url}` : null,
  ].filter((part): part is string => Boolean(part));

  await nutritionPool.query(
    `
      INSERT INTO ${nutritionSchema}.food_nutrition_values (
        food_id,
        data_source_id,
        calories_kcal,
        protein_g,
        carbs_g,
        fat_g,
        base_serving_size,
        base_unit,
        state,
        notes,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'standard', $9, now())
      ON CONFLICT (food_id, data_source_id, state)
      DO UPDATE SET
        calories_kcal = EXCLUDED.calories_kcal,
        protein_g = EXCLUDED.protein_g,
        carbs_g = EXCLUDED.carbs_g,
        fat_g = EXCLUDED.fat_g,
        base_serving_size = EXCLUDED.base_serving_size,
        base_unit = EXCLUDED.base_unit,
        notes = EXCLUDED.notes,
        deleted_at = NULL;
    `,
    [
      params.foodId,
      params.dataSourceId,
      params.row.calories_kcal,
      params.row.protein_g,
      params.row.carbs_g,
      params.row.fat_g,
      params.row.serving_qty,
      params.row.serving_unit,
      notesParts.join(' | ') || null,
    ],
  );
};

const ensureAppSystemActive = async (systemId: ExchangeSystemId): Promise<void> => {
  const config = SYSTEM_CONFIG[systemId];
  await nutritionPool.query(
    `
      INSERT INTO ${appSchema}.exchange_systems (
        id,
        country_code,
        name,
        source,
        is_active
      )
      VALUES ($1, $2, $3, 'nutrition.exchange_systems', true)
      ON CONFLICT (id)
      DO UPDATE SET
        country_code = EXCLUDED.country_code,
        name = EXCLUDED.name,
        source = EXCLUDED.source,
        is_active = true;
    `,
    [systemId, config.countryCode, config.nutritionSystemName],
  );
};

const main = async (): Promise<void> => {
  const systemRaw = parseArg('--system');
  if (!systemRaw) {
    throw new Error('Missing required --system value');
  }

  const systemId = systemRaw as ExchangeSystemId;
  const config = SYSTEM_CONFIG[systemId];
  if (!config) {
    throw new Error(`Invalid --system value: ${systemRaw}`);
  }

  const csvPathArg = parseArg('--file');
  const csvPath = csvPathArg
    ? (isAbsolute(csvPathArg) ? csvPathArg : resolve(process.cwd(), csvPathArg))
    : config.defaultCsvPath;

  const csvText = await readFile(csvPath, 'utf8');
  const rows = parseCatalogRows(csvText);
  if (rows.length === 0) {
    throw new Error(`CSV has no valid rows: ${csvPath}`);
  }

  const nutritionSystemId = await resolveSystemId(config);
  const dataSourceId = await resolveDataSourceId(config.dataSourceName);
  await ensureAppSystemActive(systemId);

  const ensureGroupId = ensureGroupResolver(nutritionSystemId);
  const ensureSubgroupId = ensureSubgroupResolver();
  const ensureCategoryId = ensureCategoryResolver();

  const foodIdByKey = new Map<string, number>();
  let processed = 0;
  for (const row of rows) {
    const groupId = await ensureGroupId(row.group_name);
    const categoryName = row.category_name || row.group_name;
    const categoryId = await ensureCategoryId(categoryName);
    const subgroupId = await ensureSubgroupId(groupId, row.subgroup_name);

    const foodKey = `${normalizeKey(row.name)}|${groupId}|${categoryId}`;
    const foodId = foodIdByKey.get(foodKey) ?? await upsertFood({
      name: row.name,
      categoryId,
      groupId,
      subgroupId,
    });
    foodIdByKey.set(foodKey, foodId);

    await upsertNutritionValues({ foodId, dataSourceId, row });
    processed += 1;

    if (processed % 250 === 0) {
      console.log(`[catalog-import] ${systemId}: processed ${processed}/${rows.length}`);
    }
  }

  console.log('[catalog-import] completed', {
    systemId,
    csvPath,
    rows: rows.length,
    uniqueFoods: foodIdByKey.size,
    dataSourceId,
    nutritionSystemId,
  });
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await nutritionPool.end();
  });
