import type {
  MealDistributionBucketInput,
  MealDistributionPlan,
  MealSlot,
  PatientProfile,
} from '../types';

const MEAL_NAMES: Record<3 | 4 | 5, string[]> = {
  3: ['Desayuno', 'Comida', 'Cena'],
  4: ['Desayuno', 'Colacion AM', 'Comida', 'Cena'],
  5: ['Desayuno', 'Colacion AM', 'Comida', 'Colacion PM', 'Cena'],
};

type GoalKey = 'lose_fat' | 'maintain' | 'gain_muscle';

const HALF_EXCHANGE_UNITS = 2;

const getDistributionMatrix = (
  mealsPerDay: 3 | 4 | 5,
  goal: GoalKey,
): Record<string, number[]> => {
  if (mealsPerDay === 3) {
    const base: Record<string, number[]> = {
      vegetable: [15, 45, 40],
      fruit: [50, 25, 25],
      carb: [30, 40, 30],
      legume: [0, 60, 40],
      protein: [25, 40, 35],
      milk: [50, 0, 50],
      fat: [30, 35, 35],
      sugar: [50, 50, 0],
    };
    if (goal === 'lose_fat') {
      base.carb = [35, 40, 25];
      base.fruit = [60, 25, 15];
    } else if (goal === 'gain_muscle') {
      base.carb = [30, 35, 35];
      base.protein = [30, 35, 35];
    }
    return base;
  }

  if (mealsPerDay === 4) {
    const base: Record<string, number[]> = {
      vegetable: [15, 10, 40, 35],
      fruit: [35, 30, 20, 15],
      carb: [25, 15, 35, 25],
      legume: [20, 0, 50, 30],
      protein: [25, 0, 40, 35],
      milk: [40, 30, 0, 30],
      fat: [25, 10, 35, 30],
      sugar: [30, 40, 30, 0],
    };
    if (goal === 'lose_fat') {
      base.carb = [30, 10, 40, 20];
      base.fruit = [40, 30, 20, 10];
      base.sugar = [0, 0, 0, 0];
    } else if (goal === 'gain_muscle') {
      base.carb = [25, 15, 30, 30];
      base.protein = [25, 5, 35, 35];
    }
    return base;
  }

  const base: Record<string, number[]> = {
    vegetable: [10, 0, 40, 5, 45],
    fruit: [25, 25, 15, 25, 10],
    carb: [25, 10, 30, 10, 25],
    legume: [0, 0, 55, 0, 45],
    protein: [20, 5, 35, 5, 35],
    milk: [35, 25, 0, 25, 15],
    fat: [25, 10, 30, 10, 25],
    sugar: [25, 25, 25, 25, 0],
  };
  if (goal === 'lose_fat') {
    base.carb = [25, 10, 35, 10, 20];
    base.fruit = [30, 25, 15, 20, 10];
    base.sugar = [0, 0, 0, 0, 0];
  } else if (goal === 'gain_muscle') {
    base.carb = [20, 15, 25, 15, 25];
    base.protein = [20, 10, 30, 10, 30];
  }
  return base;
};

const toHalfUnits = (value: number): number => Math.max(0, Math.round(value * HALF_EXCHANGE_UNITS));

const fromHalfUnits = (value: number): number => value / HALF_EXCHANGE_UNITS;

const toFamilyKey = (legacyCodeOrBucketKey: string): string => {
  if (legacyCodeOrBucketKey.startsWith('aoa_')) return 'protein';
  if (legacyCodeOrBucketKey.startsWith('cereal_')) return 'carb';
  if (legacyCodeOrBucketKey.startsWith('leche_')) return 'milk';
  if (legacyCodeOrBucketKey.startsWith('azucar_')) return 'sugar';
  if (legacyCodeOrBucketKey.startsWith('grasa_')) return 'fat';
  return legacyCodeOrBucketKey;
};

const getFamilyForBucket = (bucket: MealDistributionBucketInput): string =>
  toFamilyKey(bucket.legacyCode ?? bucket.bucketKey);

const getPercentagesForMeals = (percentages: number[] | undefined, mealsCount: number): number[] => {
  if (mealsCount <= 0) return [];

  const resolved = Array.from({ length: mealsCount }, (_, index) => {
    const raw = percentages?.[index];
    if (typeof raw !== 'number' || Number.isNaN(raw)) return 0;
    return Math.max(0, raw);
  });

  const sum = resolved.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return Array.from({ length: mealsCount }, () => 100 / mealsCount);
  }

  return resolved;
};

const toNormalizedWeights = (percentages: number[]): number[] => {
  const total = percentages.reduce((acc, value) => acc + value, 0);
  if (total <= 0) {
    return Array.from({ length: percentages.length }, () => 1 / Math.max(1, percentages.length));
  }

  return percentages.map((value) => value / total);
};

const selectPrimaryMealIndex = (percentages: number[]): number => {
  let bestIndex = 0;
  let bestValue = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < percentages.length; index += 1) {
    const value = percentages[index] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  }

  return bestIndex;
};

const allocateUnitsByLargestRemainder = (
  targetUnits: number,
  percentages: number[],
): number[] => {
  const mealCount = percentages.length;
  const allocations = Array.from({ length: mealCount }, () => 0);

  if (mealCount === 0 || targetUnits <= 0) return allocations;

  const normalizedWeights = toNormalizedWeights(percentages);

  if (targetUnits <= HALF_EXCHANGE_UNITS) {
    allocations[selectPrimaryMealIndex(percentages)] = targetUnits;
    return allocations;
  }

  const rawUnits = normalizedWeights.map((weight) => weight * targetUnits);
  const flooredUnits = rawUnits.map((value) => Math.floor(value));
  let remaining = targetUnits - flooredUnits.reduce((sum, value) => sum + value, 0);

  for (let index = 0; index < mealCount; index += 1) {
    allocations[index] = flooredUnits[index] ?? 0;
  }

  if (remaining <= 0) return allocations;

  const priority = Array.from({ length: mealCount }, (_, index) => ({
    index,
    remainder: (rawUnits[index] ?? 0) - (flooredUnits[index] ?? 0),
    pct: percentages[index] ?? 0,
  })).sort((a, b) =>
    b.remainder - a.remainder ||
    b.pct - a.pct ||
    a.index - b.index);

  if (priority.length === 0) return allocations;

  let cursor = 0;
  while (remaining > 0) {
    const target = priority[cursor % priority.length];
    if (!target) break;
    allocations[target.index] = (allocations[target.index] ?? 0) + 1;
    remaining -= 1;
    cursor += 1;
  }

  return allocations;
};

const selectEffectiveBuckets = (
  buckets: MealDistributionBucketInput[],
): MealDistributionBucketInput[] => {
  const parentGroupIdsWithSubgroups = new Set<number>();

  for (const bucket of buckets) {
    if (bucket.bucketType === 'subgroup' && typeof bucket.parentGroupId === 'number') {
      parentGroupIdsWithSubgroups.add(bucket.parentGroupId);
    }
  }

  if (parentGroupIdsWithSubgroups.size === 0) {
    return buckets;
  }

  return buckets.filter((bucket) => {
    if (bucket.bucketType !== 'group') return true;
    if (typeof bucket.bucketId !== 'number') return true;
    return !parentGroupIdsWithSubgroups.has(bucket.bucketId);
  });
};

export const distributeMeals = (
  bucketPlan: MealDistributionBucketInput[],
  profile: Pick<PatientProfile, 'mealsPerDay' | 'goal'>,
): MealDistributionPlan => {
  const meals = profile.mealsPerDay as 3 | 4 | 5;
  const mealNames = MEAL_NAMES[meals] ?? MEAL_NAMES[3];
  const goalKey = (profile.goal ?? 'maintain') as GoalKey;
  const matrix = getDistributionMatrix(meals, goalKey);
  const effectiveBuckets = selectEffectiveBuckets(bucketPlan);
  const mealCount = mealNames.length;

  const slots: MealSlot[] = mealNames.map((name, mealIdx) => {
    const distribution: Record<string, number> = {};

    for (const bucket of effectiveBuckets) {
      const family = getFamilyForBucket(bucket);
      const percentages = getPercentagesForMeals(matrix[family], mealCount);
      const targetUnits = toHalfUnits(bucket.exchangesPerDay);

      if (targetUnits <= 0) {
        distribution[bucket.bucketKey] = 0;
        continue;
      }

      const unitsByMeal = allocateUnitsByLargestRemainder(targetUnits, percentages);
      distribution[bucket.bucketKey] = fromHalfUnits(unitsByMeal[mealIdx] ?? 0);
    }

    return { name, distribution };
  });

  return slots;
};

export { MEAL_NAMES };
