import 'dotenv/config';

import path from 'node:path';

import type { ExchangeGroupCode, ExchangeSubgroupCode } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';
import {
  loadMxMappings,
  mandatorySubgroupGroupCodes,
  mapExternalAliasToBucket,
  normalizeText,
  parseCsv,
  parseNumber,
  round2,
} from './smaeFoodCurationUtils.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);
const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

type CuratedRow = {
  foodId: number;
  name: string;
  action: 'update' | 'keep' | 'exclude_runtime' | 'review_required';
  recommendedGroupId: number | null;
  recommendedSubgroupId: number | null;
  recommendedServingQty: number | null;
  recommendedServingUnit: string | null;
};

type NewFoodRow = {
  name: string;
  groupCode: ExchangeGroupCode;
  subgroupCode: ExchangeSubgroupCode | null;
  portionQty: number;
  portionUnit: string;
  carbsPer100: number;
  proteinPer100: number;
  fatPer100: number;
};

const parseCuratedRows = async (filePath: string): Promise<CuratedRow[]> => {
  const rawRows = await parseCsv(filePath);

  return rawRows
    .map((row): CuratedRow | null => {
      const foodId = parseNumber(row.food_id);
      if (!foodId || foodId <= 0) return null;

      const actionRaw = (row.action ?? '').trim().toLowerCase();
      const action: CuratedRow['action'] =
        actionRaw === 'update' || actionRaw === 'keep' || actionRaw === 'exclude_runtime' || actionRaw === 'review_required'
          ? actionRaw
          : 'review_required';

      return {
        foodId: Math.trunc(foodId),
        name: row.name ?? '',
        action,
        recommendedGroupId: parseNumber(row.recommended_group_id),
        recommendedSubgroupId: parseNumber(row.recommended_subgroup_id),
        recommendedServingQty: parseNumber(row.recommended_serving_qty),
        recommendedServingUnit: (row.recommended_serving_unit ?? '').trim() || null,
      };
    })
    .filter((row): row is CuratedRow => row !== null);
};

const toGroupCode = (value: string | null | undefined): ExchangeGroupCode | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;

  const allowed: ExchangeGroupCode[] = ['vegetable', 'fruit', 'carb', 'protein', 'legume', 'fat', 'milk', 'sugar'];
  return allowed.includes(normalized as ExchangeGroupCode) ? (normalized as ExchangeGroupCode) : null;
};

const toSubgroupCode = (value: string | null | undefined): ExchangeSubgroupCode | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;

  const allowed: ExchangeSubgroupCode[] = [
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
  ];

  return allowed.includes(normalized as ExchangeSubgroupCode)
    ? (normalized as ExchangeSubgroupCode)
    : null;
};

const parseNewFoodRows = async (filePath: string): Promise<NewFoodRow[]> => {
  const rawRows = await parseCsv(filePath);

  const parsedRows: NewFoodRow[] = [];

  for (const row of rawRows) {
    const action = (row.action ?? '').trim().toLowerCase();
    if (action && action !== 'candidate_insert' && action !== 'insert' && action !== 'approved') {
      continue;
    }

    const name = (row.name ?? '').trim();
    if (!name) continue;

    let groupCode = toGroupCode(row.group_code);
    if (!groupCode && row.source_group_alias) {
      const mapped = mapExternalAliasToBucket(
        row.source_group_alias.trim().toUpperCase(),
        parseNumber(row.protein_per_100) ?? parseNumber(row.protein_g) ?? 0,
        parseNumber(row.fat_per_100) ?? parseNumber(row.fat_g) ?? 0,
      );
      groupCode = mapped?.groupCode ?? null;
    }

    if (!groupCode) continue;

    let subgroupCode = toSubgroupCode(row.subgroup_code);
    if (!subgroupCode && row.source_group_alias) {
      const mapped = mapExternalAliasToBucket(
        row.source_group_alias.trim().toUpperCase(),
        parseNumber(row.protein_per_100) ?? parseNumber(row.protein_g) ?? 0,
        parseNumber(row.fat_per_100) ?? parseNumber(row.fat_g) ?? 0,
      );
      subgroupCode = mapped?.subgroupCode ?? null;
    }

    const portionQty = parseNumber(row.portion_qty);
    if (!portionQty || portionQty <= 0) continue;

    const portionUnit = (row.portion_unit ?? '').trim() || (groupCode === 'milk' ? 'ml' : 'g');

    const carbsPer100Raw = parseNumber(row.carbs_per_100);
    const proteinPer100Raw = parseNumber(row.protein_per_100);
    const fatPer100Raw = parseNumber(row.fat_per_100);

    const carbsServingRaw = parseNumber(row.carbs_g);
    const proteinServingRaw = parseNumber(row.protein_g);
    const fatServingRaw = parseNumber(row.fat_g);

    const carbsPer100 =
      carbsPer100Raw ??
      (carbsServingRaw !== null ? (carbsServingRaw * 100) / portionQty : null);
    const proteinPer100 =
      proteinPer100Raw ??
      (proteinServingRaw !== null ? (proteinServingRaw * 100) / portionQty : null);
    const fatPer100 =
      fatPer100Raw ??
      (fatServingRaw !== null ? (fatServingRaw * 100) / portionQty : null);

    if (carbsPer100 === null || proteinPer100 === null || fatPer100 === null) continue;

    parsedRows.push({
      name,
      groupCode,
      subgroupCode,
      portionQty: round2(portionQty),
      portionUnit,
      carbsPer100: round2(carbsPer100),
      proteinPer100: round2(proteinPer100),
      fatPer100: round2(fatPer100),
    });
  }

  return parsedRows;
};

const toSqlIdentifier = (value: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const root = path.resolve(process.cwd(), '..', '..');
  const curatedCsvPath = path.join(root, 'apps', 'api', 'prisma', 'data', 'smae_food_curated.approved.csv');
  const newFoodsCsvPath = path.join(root, 'apps', 'api', 'prisma', 'data', 'smae_new_foods.approved.csv');

  const [mxMappings, curatedRows, newFoodRows] = await Promise.all([
    loadMxMappings(),
    parseCuratedRows(curatedCsvPath),
    parseNewFoodRows(newFoodsCsvPath),
  ]);

  const groupIdByCode = mxMappings.groupIdByCode;
  const subgroupIdByCode = mxMappings.subgroupIdByCode;

  const validCuratedRows = curatedRows.filter((row) => row.action !== 'review_required');

  const client = await nutritionPool.connect();
  try {
    await client.query('BEGIN');

    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const backupFoodsTable = toSqlIdentifier(`backup_${timestamp}_smae_foods`);
    const backupFnvTable = toSqlIdentifier(`backup_${timestamp}_smae_fnv_active`);
    const backupOverridesTable = toSqlIdentifier(`backup_${timestamp}_smae_overrides`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${appSchema}.${backupFoodsTable} AS
      SELECT f.*
      FROM ${nutritionSchema}.foods f
      JOIN ${nutritionSchema}.exchange_groups eg ON eg.id = f.exchange_group_id
      WHERE eg.system_id = $1;
    `, [mxMappings.nutritionSystemId]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${appSchema}.${backupFnvTable} AS
      SELECT fnv.*
      FROM ${nutritionSchema}.food_nutrition_values fnv
      LEFT JOIN ${nutritionSchema}.data_sources ds ON ds.id = fnv.data_source_id
      WHERE fnv.deleted_at IS NULL
        AND translate(lower(COALESCE(ds.name,'')), '·ÈÌÛ˙‰ÎÔˆ¸Ò', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%';
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${appSchema}.${backupOverridesTable} AS
      SELECT *
      FROM ${appSchema}.food_exchange_overrides
      WHERE system_id = 'mx_smae';
    `);

    let updatedFoods = 0;
    let excludedFoods = 0;

    for (const row of validCuratedRows) {
      let groupId = row.recommendedGroupId;
      let subgroupId = row.recommendedSubgroupId;

      if (subgroupId && mxMappings.parentGroupIdBySubgroupId.has(subgroupId)) {
        groupId = mxMappings.parentGroupIdBySubgroupId.get(subgroupId) ?? groupId;
      }

      if (row.action === 'exclude_runtime') {
        await client.query(
          `
            INSERT INTO ${appSchema}.food_exchange_overrides
              (food_id, system_id, group_id, subgroup_id, equivalent_portion_qty, portion_unit, is_active)
            VALUES
              ($1, 'mx_smae', $2, $3, $4, $5, false)
            ON CONFLICT (food_id, system_id)
            DO UPDATE SET
              group_id = COALESCE(EXCLUDED.group_id, ${appSchema}.food_exchange_overrides.group_id),
              subgroup_id = COALESCE(EXCLUDED.subgroup_id, ${appSchema}.food_exchange_overrides.subgroup_id),
              equivalent_portion_qty = COALESCE(EXCLUDED.equivalent_portion_qty, ${appSchema}.food_exchange_overrides.equivalent_portion_qty),
              portion_unit = COALESCE(EXCLUDED.portion_unit, ${appSchema}.food_exchange_overrides.portion_unit),
              is_active = false;
          `,
          [
            row.foodId,
            groupId,
            subgroupId,
            row.recommendedServingQty,
            row.recommendedServingUnit,
          ],
        );
        excludedFoods += 1;
        continue;
      }

      if (!groupId || !row.recommendedServingQty || row.recommendedServingQty <= 0) {
        continue;
      }

      const normalizedUnit = row.recommendedServingUnit ?? (groupId === groupIdByCode.get('milk') ? 'ml' : 'g');

      await client.query(
        `
          UPDATE ${nutritionSchema}.foods f
          SET
            exchange_group_id = $2,
            exchange_subgroup_id = $3,
            base_serving_size = $4,
            base_unit = $5,
            calories_kcal = CASE
              WHEN f.calories_kcal IS NULL THEN NULL
              ELSE ROUND((f.calories_kcal::numeric * $4::numeric / COALESCE(NULLIF(f.base_serving_size, 0), 100)::numeric), 2)
            END,
            protein_g = CASE
              WHEN f.protein_g IS NULL THEN NULL
              ELSE ROUND((f.protein_g::numeric * $4::numeric / COALESCE(NULLIF(f.base_serving_size, 0), 100)::numeric), 2)
            END,
            carbs_g = CASE
              WHEN f.carbs_g IS NULL THEN NULL
              ELSE ROUND((f.carbs_g::numeric * $4::numeric / COALESCE(NULLIF(f.base_serving_size, 0), 100)::numeric), 2)
            END,
            fat_g = CASE
              WHEN f.fat_g IS NULL THEN NULL
              ELSE ROUND((f.fat_g::numeric * $4::numeric / COALESCE(NULLIF(f.base_serving_size, 0), 100)::numeric), 2)
            END
          WHERE f.id = $1;
        `,
        [row.foodId, groupId, subgroupId, row.recommendedServingQty, normalizedUnit],
      );

      await client.query(
        `
          UPDATE ${nutritionSchema}.food_nutrition_values fnv
          SET
            base_serving_size = $2,
            base_unit = $3,
            calories_kcal = CASE
              WHEN fnv.calories_kcal IS NULL THEN NULL
              ELSE ROUND((fnv.calories_kcal::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END,
            protein_g = CASE
              WHEN fnv.protein_g IS NULL THEN NULL
              ELSE ROUND((fnv.protein_g::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END,
            carbs_g = CASE
              WHEN fnv.carbs_g IS NULL THEN NULL
              ELSE ROUND((fnv.carbs_g::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END,
            fat_g = CASE
              WHEN fnv.fat_g IS NULL THEN NULL
              ELSE ROUND((fnv.fat_g::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END,
            fiber_g = CASE
              WHEN fnv.fiber_g IS NULL THEN NULL
              ELSE ROUND((fnv.fiber_g::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END,
            glycemic_load = CASE
              WHEN fnv.glycemic_load IS NULL THEN NULL
              ELSE ROUND((fnv.glycemic_load::numeric * $2::numeric / COALESCE(NULLIF(fnv.base_serving_size, 0), 100)::numeric), 2)
            END
          WHERE fnv.food_id = $1
            AND fnv.deleted_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM ${nutritionSchema}.data_sources ds
              WHERE ds.id = fnv.data_source_id
                AND translate(lower(COALESCE(ds.name,'')), '·ÈÌÛ˙‰ÎÔˆ¸Ò', 'aeiouaeioun') SIMILAR TO '%(smae|mex)%'
            );
        `,
        [row.foodId, row.recommendedServingQty, normalizedUnit],
      );

      await client.query(
        `
          INSERT INTO ${appSchema}.food_exchange_overrides
            (food_id, system_id, group_id, subgroup_id, equivalent_portion_qty, portion_unit, is_active)
          VALUES
            ($1, 'mx_smae', $2, $3, $4, $5, true)
          ON CONFLICT (food_id, system_id)
          DO UPDATE SET
            group_id = EXCLUDED.group_id,
            subgroup_id = EXCLUDED.subgroup_id,
            equivalent_portion_qty = EXCLUDED.equivalent_portion_qty,
            portion_unit = EXCLUDED.portion_unit,
            is_active = true;
        `,
        [row.foodId, groupId, subgroupId, row.recommendedServingQty, normalizedUnit],
      );

      updatedFoods += 1;
    }

    await client.query(
      `
        UPDATE ${appSchema}.food_exchange_overrides feo
        SET group_id = es.exchange_group_id
        FROM ${nutritionSchema}.exchange_subgroups es
        WHERE feo.system_id = 'mx_smae'
          AND feo.subgroup_id IS NOT NULL
          AND es.id = feo.subgroup_id
          AND feo.group_id IS DISTINCT FROM es.exchange_group_id;
      `,
    );

    const namesResult = await client.query<{ id: number; name: string }>(
      `
        SELECT id, name
        FROM ${nutritionSchema}.foods;
      `,
    );

    const existingNames = new Set<string>(namesResult.rows.map((food) => normalizeText(food.name)));

    const [maxFoodResult, maxServingResult] = await Promise.all([
      client.query<{ max_id: number }>(`SELECT COALESCE(MAX(id), 0)::int AS max_id FROM ${nutritionSchema}.foods;`),
      client.query<{ max_id: number }>(`SELECT COALESCE(MAX(id), 0)::int AS max_id FROM ${nutritionSchema}.serving_units;`),
    ]);

    let nextFoodId = maxFoodResult.rows[0]?.max_id ?? 0;
    let nextServingUnitId = maxServingResult.rows[0]?.max_id ?? 0;
    let insertedFoods = 0;

    for (const row of newFoodRows) {
      const normalizedName = normalizeText(row.name);
      if (!normalizedName || existingNames.has(normalizedName)) {
        continue;
      }

      let groupId = groupIdByCode.get(row.groupCode) ?? null;
      let subgroupId = row.subgroupCode ? subgroupIdByCode.get(row.subgroupCode) ?? null : null;

      if (subgroupId && mxMappings.parentGroupIdBySubgroupId.has(subgroupId)) {
        groupId = mxMappings.parentGroupIdBySubgroupId.get(subgroupId) ?? groupId;
      }

      if (!groupId) continue;

      if (mandatorySubgroupGroupCodes.has(row.groupCode) && !subgroupId) {
        continue;
      }

      const factor = row.portionQty / 100;
      const carbsServing = round2(row.carbsPer100 * factor);
      const proteinServing = round2(row.proteinPer100 * factor);
      const fatServing = round2(row.fatPer100 * factor);
      const caloriesServing = round2((carbsServing + proteinServing) * 4 + fatServing * 9);

      nextFoodId += 1;
      nextServingUnitId += 1;

      await client.query(
        `
          INSERT INTO ${nutritionSchema}.foods
            (id, name, brand, category_id, exchange_group_id, is_recipe, base_serving_size, base_unit, calories_kcal, protein_g, carbs_g, fat_g, exchange_subgroup_id)
          VALUES
            ($1, $2, NULL, NULL, $3, false, $4, $5, $6, $7, $8, $9, $10);
        `,
        [
          nextFoodId,
          row.name,
          groupId,
          row.portionQty,
          row.portionUnit,
          caloriesServing,
          proteinServing,
          carbsServing,
          fatServing,
          subgroupId,
        ],
      );

      await client.query(
        `
          INSERT INTO ${nutritionSchema}.food_nutrition_values
            (food_id, data_source_id, calories_kcal, protein_g, carbs_g, fat_g, base_serving_size, base_unit, state, notes, deleted_at, created_at)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, 'standard', 'inserted_by_smae_food_curation', NULL, NOW());
        `,
        [
          nextFoodId,
          mxMappings.smaeDataSourceId,
          caloriesServing,
          proteinServing,
          carbsServing,
          fatServing,
          row.portionQty,
          row.portionUnit,
        ],
      );

      await client.query(
        `
          INSERT INTO ${nutritionSchema}.serving_units
            (id, food_id, unit_name, gram_equivalent, is_exchange_unit)
          VALUES
            ($1, $2, 'PorciÛn equivalente curada', $3, true);
        `,
        [nextServingUnitId, nextFoodId, row.portionQty],
      );

      await client.query(
        `
          INSERT INTO ${appSchema}.food_exchange_overrides
            (food_id, system_id, group_id, subgroup_id, equivalent_portion_qty, portion_unit, is_active)
          VALUES
            ($1, 'mx_smae', $2, $3, $4, $5, true)
          ON CONFLICT (food_id, system_id)
          DO UPDATE SET
            group_id = EXCLUDED.group_id,
            subgroup_id = EXCLUDED.subgroup_id,
            equivalent_portion_qty = EXCLUDED.equivalent_portion_qty,
            portion_unit = EXCLUDED.portion_unit,
            is_active = true;
        `,
        [nextFoodId, groupId, subgroupId, row.portionQty, row.portionUnit],
      );

      existingNames.add(normalizedName);
      insertedFoods += 1;
    }

    await client.query('COMMIT');

    console.log(`Curated rows loaded: ${curatedRows.length}`);
    console.log(`Curated rows applied (update/keep): ${updatedFoods}`);
    console.log(`Curated rows excluded at runtime: ${excludedFoods}`);
    console.log(`New foods inserted: ${insertedFoods}`);
    console.log(`Backups: ${appSchema}.${backupFoodsTable}, ${appSchema}.${backupFnvTable}, ${appSchema}.${backupOverridesTable}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await nutritionPool.end().catch(() => undefined);
  });
