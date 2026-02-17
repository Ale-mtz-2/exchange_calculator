import type { ExchangeSystemId } from '@equivalentes/shared';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { safeSchema } from '../utils/sql.js';

const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);
const appSchema = safeSchema(env.DB_APP_SCHEMA);

const DEFAULT_SOURCE_PRIORITY = 1000;

export type CanonicalNutritionValue = {
  nutritionValueId: number;
  foodId: number;
  dataSourceId: number | null;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  servingQty: number;
  servingUnit: string;
};

export type NutritionValueCandidate = {
  id: number;
  foodId: number;
  dataSourceId: number | null;
  state: string | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingQty: number | null;
  servingUnit: string | null;
};

const isUtilizableCandidate = (candidate: NutritionValueCandidate): boolean =>
  candidate.caloriesKcal !== null &&
  candidate.proteinG !== null &&
  candidate.carbsG !== null &&
  candidate.fatG !== null;

const candidatePriority = (
  candidate: NutritionValueCandidate,
  sourcePriority: ReadonlyMap<number, number>,
): number => {
  if (candidate.dataSourceId === null) return DEFAULT_SOURCE_PRIORITY;
  return sourcePriority.get(candidate.dataSourceId) ?? DEFAULT_SOURCE_PRIORITY;
};

export const selectCanonicalNutritionValue = (
  candidates: NutritionValueCandidate[],
  sourcePriority: ReadonlyMap<number, number>,
): CanonicalNutritionValue | null => {
  const utilizable = candidates.filter(isUtilizableCandidate);
  if (utilizable.length === 0) return null;

  const sorted = [...utilizable].sort((a, b) => {
    const stateOrderA = a.state === 'standard' ? 0 : 1;
    const stateOrderB = b.state === 'standard' ? 0 : 1;
    if (stateOrderA !== stateOrderB) return stateOrderA - stateOrderB;

    const sourceOrderA = candidatePriority(a, sourcePriority);
    const sourceOrderB = candidatePriority(b, sourcePriority);
    if (sourceOrderA !== sourceOrderB) return sourceOrderA - sourceOrderB;

    return b.id - a.id;
  });

  const selected = sorted[0];
  if (!selected) return null;

  return {
    nutritionValueId: selected.id,
    foodId: selected.foodId,
    dataSourceId: selected.dataSourceId,
    caloriesKcal: selected.caloriesKcal ?? 0,
    proteinG: selected.proteinG ?? 0,
    carbsG: selected.carbsG ?? 0,
    fatG: selected.fatG ?? 0,
    servingQty: selected.servingQty ?? 100,
    servingUnit: selected.servingUnit ?? 'g',
  };
};

export const resolveCanonicalNutritionValues = async (
  systemId: ExchangeSystemId | string,
): Promise<Map<number, CanonicalNutritionValue>> => {
  const result = await nutritionPool.query<{
    nutrition_value_id: number;
    food_id: number;
    data_source_id: number | null;
    calories_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    serving_qty: number;
    serving_unit: string;
  }>(
    `
      SELECT DISTINCT ON (fnv.food_id)
        fnv.id AS nutrition_value_id,
        fnv.food_id,
        fnv.data_source_id,
        fnv.calories_kcal::float8 AS calories_kcal,
        fnv.protein_g::float8 AS protein_g,
        fnv.carbs_g::float8 AS carbs_g,
        fnv.fat_g::float8 AS fat_g,
        COALESCE(fnv.base_serving_size, 100)::float8 AS serving_qty,
        COALESCE(fnv.base_unit, 'g') AS serving_unit
      FROM ${nutritionSchema}.food_nutrition_values fnv
      LEFT JOIN ${appSchema}.exchange_source_priorities esp
        ON esp.system_id = $1
       AND esp.data_source_id = fnv.data_source_id
       AND esp.is_active = true
      WHERE fnv.deleted_at IS NULL
        AND fnv.calories_kcal IS NOT NULL
        AND fnv.protein_g IS NOT NULL
        AND fnv.carbs_g IS NOT NULL
        AND fnv.fat_g IS NOT NULL
      ORDER BY
        fnv.food_id,
        CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
        COALESCE(esp.priority, ${DEFAULT_SOURCE_PRIORITY}),
        fnv.id DESC;
    `,
    [systemId],
  );

  const map = new Map<number, CanonicalNutritionValue>();
  for (const row of result.rows) {
    map.set(row.food_id, {
      nutritionValueId: row.nutrition_value_id,
      foodId: row.food_id,
      dataSourceId: row.data_source_id,
      caloriesKcal: row.calories_kcal,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      servingQty: row.serving_qty,
      servingUnit: row.serving_unit,
    });
  }

  return map;
};
