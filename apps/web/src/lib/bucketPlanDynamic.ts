import type {
  EquivalentBucketCatalogItem,
  EquivalentBucketPlanV2,
  RankedFoodItemV2,
} from '@equivalentes/shared';

const MAX_DYNAMIC_EXCHANGES = 24;

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const round = (value: number, digits = 1): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

export const roundHalf = (value: number): number => Math.max(0, Math.round(value * 2) / 2);

export const roundHalfSigned = (value: number): number => Math.round(value * 2) / 2;

export type EditableBucketRow = {
  bucketType: 'group' | 'subgroup';
  bucketId: number;
  bucketKey: string;
  bucketName: string;
  parentGroupId?: number;
  parentGroupName?: string;
  legacyCode?: string;
  baseExchanges: number;
  exchangesPerDay: number;
  choPerExchange: number;
  proPerExchange: number;
  fatPerExchange: number;
  kcalPerExchange: number;
  choG: number;
  proG: number;
  fatG: number;
  kcal: number;
};

const bucketCatalogSort = (
  a: EquivalentBucketCatalogItem,
  b: EquivalentBucketCatalogItem,
): number => {
  if (a.bucketType !== b.bucketType) {
    return a.bucketType === 'group' ? -1 : 1;
  }

  if (a.bucketType === 'subgroup' && b.bucketType === 'subgroup') {
    const parentA = a.parentGroupId ?? Number.MAX_SAFE_INTEGER;
    const parentB = b.parentGroupId ?? Number.MAX_SAFE_INTEGER;
    if (parentA !== parentB) return parentA - parentB;
  }

  return a.bucketId - b.bucketId;
};

const derivePerExchangeFromPlan = (
  bucketPlanRow: EquivalentBucketPlanV2,
): Pick<EditableBucketRow, 'choPerExchange' | 'proPerExchange' | 'fatPerExchange' | 'kcalPerExchange'> => {
  const base = Number(bucketPlanRow.exchangesPerDay);
  if (base > 0) {
    return {
      choPerExchange: bucketPlanRow.choG / base,
      proPerExchange: bucketPlanRow.proG / base,
      fatPerExchange: bucketPlanRow.fatG / base,
      kcalPerExchange: bucketPlanRow.kcal / base,
    };
  }

  return {
    choPerExchange: 0,
    proPerExchange: 0,
    fatPerExchange: 0,
    kcalPerExchange: 0,
  };
};

const toEditableBucketRow = (
  catalogBucket: EquivalentBucketCatalogItem,
  bucketPlanByKey: Map<string, EquivalentBucketPlanV2>,
  adjustments: Record<string, number>,
): EditableBucketRow => {
  const bucketPlanRow = bucketPlanByKey.get(catalogBucket.bucketKey);
  const baseExchanges = bucketPlanRow?.exchangesPerDay ?? 0;
  const delta = adjustments[catalogBucket.bucketKey] ?? 0;
  const exchangesPerDay = roundHalf(
    clamp(baseExchanges + delta, 0, MAX_DYNAMIC_EXCHANGES),
  );

  return {
    bucketType: catalogBucket.bucketType,
    bucketId: catalogBucket.bucketId,
    bucketKey: catalogBucket.bucketKey,
    bucketName: catalogBucket.bucketName,
    ...(typeof catalogBucket.parentGroupId === 'number'
      ? { parentGroupId: catalogBucket.parentGroupId }
      : {}),
    ...(catalogBucket.parentGroupName ? { parentGroupName: catalogBucket.parentGroupName } : {}),
    ...(catalogBucket.legacyCode ? { legacyCode: catalogBucket.legacyCode } : {}),
    baseExchanges,
    exchangesPerDay,
    choPerExchange: catalogBucket.choPerExchange,
    proPerExchange: catalogBucket.proPerExchange,
    fatPerExchange: catalogBucket.fatPerExchange,
    kcalPerExchange: catalogBucket.kcalPerExchange,
    choG: round(catalogBucket.choPerExchange * exchangesPerDay),
    proG: round(catalogBucket.proPerExchange * exchangesPerDay),
    fatG: round(catalogBucket.fatPerExchange * exchangesPerDay),
    kcal: round(catalogBucket.kcalPerExchange * exchangesPerDay, 0),
  };
};

const toFallbackCatalogBucket = (
  bucketPlanRow: EquivalentBucketPlanV2,
): EquivalentBucketCatalogItem => {
  const perExchange = derivePerExchangeFromPlan(bucketPlanRow);
  return {
    bucketType: bucketPlanRow.bucketType,
    bucketId: bucketPlanRow.bucketId,
    bucketKey: bucketPlanRow.bucketKey,
    bucketName: bucketPlanRow.bucketName,
    ...(bucketPlanRow.legacyCode ? { legacyCode: bucketPlanRow.legacyCode } : {}),
    ...perExchange,
  };
};

export const buildEditableBucketRows = (
  bucketCatalog: EquivalentBucketCatalogItem[],
  bucketPlan: EquivalentBucketPlanV2[],
  adjustments: Record<string, number>,
): EditableBucketRow[] => {
  const bucketPlanByKey = new Map<string, EquivalentBucketPlanV2>(
    bucketPlan.map((bucket) => [bucket.bucketKey, bucket]),
  );

  const catalogByKey = new Map<string, EquivalentBucketCatalogItem>();
  for (const bucket of bucketCatalog) {
    catalogByKey.set(bucket.bucketKey, bucket);
  }

  const rows = [...bucketCatalog]
    .sort(bucketCatalogSort)
    .map((bucket) => toEditableBucketRow(bucket, bucketPlanByKey, adjustments));

  for (const bucketPlanRow of bucketPlan) {
    if (catalogByKey.has(bucketPlanRow.bucketKey)) continue;
    const fallback = toFallbackCatalogBucket(bucketPlanRow);
    rows.push(toEditableBucketRow(fallback, bucketPlanByKey, adjustments));
  }

  return rows;
};

export const canIncrease = (bucket: EditableBucketRow): boolean =>
  bucket.kcalPerExchange > 0 ||
  bucket.choPerExchange > 0 ||
  bucket.proPerExchange > 0 ||
  bucket.fatPerExchange > 0;

export const buildBucketRowIndex = (
  bucketRows: EditableBucketRow[],
): Map<string, EditableBucketRow> =>
  new Map(bucketRows.map((bucket) => [bucket.bucketKey, bucket]));

export const buildBaseExchangesByBucket = (
  bucketRows: EditableBucketRow[],
): Map<string, number> =>
  new Map(bucketRows.map((bucket) => [bucket.bucketKey, bucket.baseExchanges]));

export const buildTopFoodsByBucket = (
  rankedFoods: RankedFoodItemV2[],
  limit = 6,
): Record<string, RankedFoodItemV2[]> => {
  const grouped: Record<string, RankedFoodItemV2[]> = {};

  for (const food of rankedFoods) {
    const key = String(food.bucketKey);
    const bucket = grouped[key] ?? [];
    if (bucket.length >= limit) continue;
    bucket.push(food);
    grouped[key] = bucket;
  }

  return grouped;
};

export const isNonRebalanceBucket = (
  bucket: EditableBucketRow,
): boolean => bucket.legacyCode === 'vegetable' || bucket.legacyCode === 'fruit';
