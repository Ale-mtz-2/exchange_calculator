import type { MealDistributionPlan } from '@equivalentes/shared';

import { roundHalf, roundHalfSigned } from './bucketPlanDynamic';

export type MealCellRow = Record<string, number>;
export type MealCellOverridesByBucket = Record<string, MealCellRow>;

const rowSum = (row: MealCellRow, mealOrder: string[]): number =>
  roundHalf(
    mealOrder.reduce((sum, mealName) => sum + (row[mealName] ?? 0), 0),
  );

const safeHalf = (value: number): number => roundHalf(Math.max(0, value));

const mealPriority = (
  preferredMealName: string,
  mealOrder: string[],
  row: MealCellRow,
): string[] => {
  const preferred = mealOrder.includes(preferredMealName) ? preferredMealName : mealOrder[0];
  const rest = mealOrder
    .filter((mealName) => mealName !== preferred)
    .sort((a, b) => (row[b] ?? 0) - (row[a] ?? 0));
  return preferred ? [preferred, ...rest] : rest;
};

export const normalizeBucketMealRow = (
  row: MealCellRow,
  targetTotal: number,
  preferredMealName: string,
  mealOrder: string[],
): MealCellRow => {
  const normalized: MealCellRow = {};
  for (const mealName of mealOrder) {
    normalized[mealName] = safeHalf(row[mealName] ?? 0);
  }

  let diff = roundHalfSigned(targetTotal - rowSum(normalized, mealOrder));
  if (diff === 0) return normalized;

  const priority = mealPriority(preferredMealName, mealOrder, normalized);
  if (priority.length === 0) return normalized;

  if (diff > 0) {
    const preferred = priority[0] as string;
    normalized[preferred] = safeHalf((normalized[preferred] ?? 0) + diff);
    return normalized;
  }

  let remaining = Math.abs(diff);
  for (const mealName of priority) {
    if (remaining < 0.5) break;
    let current = normalized[mealName] ?? 0;
    while (remaining >= 0.5 && current >= 0.5) {
      current = safeHalf(current - 0.5);
      remaining = roundHalfSigned(remaining - 0.5);
    }
    normalized[mealName] = current;
  }

  return normalized;
};

export const applyMealCellStep = (
  row: MealCellRow,
  mealName: string,
  step: number,
  targetTotal: number,
  mealOrder: string[],
): MealCellRow => {
  const current = row[mealName] ?? 0;
  const nextCell = safeHalf(current + step);
  return normalizeBucketMealRow(
    { ...row, [mealName]: nextCell },
    targetTotal,
    mealName,
    mealOrder,
  );
};

const buildBucketMealRowFromDistribution = (
  mealDistribution: MealDistributionPlan,
  bucketKey: string,
  mealOrder: string[],
): MealCellRow => {
  const slotsByName = new Map(mealDistribution.map((slot) => [slot.name, slot]));
  const row: MealCellRow = {};

  for (const mealName of mealOrder) {
    const slot = slotsByName.get(mealName);
    row[mealName] = safeHalf(slot?.distribution[bucketKey] ?? 0);
  }

  return row;
};

export const mergeMealOverrides = (
  previous: MealCellOverridesByBucket,
  bucketKey: string,
  nextRow: MealCellRow,
  baselineDistribution: MealDistributionPlan,
  mealOrder: string[],
): MealCellOverridesByBucket => {
  const baselineRow = buildBucketMealRowFromDistribution(
    baselineDistribution,
    bucketKey,
    mealOrder,
  );
  const isEqualToBaseline = mealOrder.every(
    (mealName) => safeHalf(nextRow[mealName] ?? 0) === safeHalf(baselineRow[mealName] ?? 0),
  );

  const next = { ...previous };
  if (isEqualToBaseline) {
    delete next[bucketKey];
    return next;
  }

  const normalized: MealCellRow = {};
  for (const mealName of mealOrder) {
    normalized[mealName] = safeHalf(nextRow[mealName] ?? 0);
  }
  next[bucketKey] = normalized;
  return next;
};

export const filterRebalanceCandidates = <T extends { bucketKey: string }>(
  rows: T[],
  targetBucketKey: string,
  lockedBucketKeys: ReadonlySet<string>,
): T[] =>
  rows.filter(
    (row) => row.bucketKey !== targetBucketKey && !lockedBucketKeys.has(row.bucketKey),
  );
