import type {
  MealDistributionBucketInput,
  MealDistributionPlan,
  MealSlot,
  PatientProfile,
} from '../types';
import type { DietPattern, ExchangeSystemId } from '../catalog/systems';

const MEAL_NAMES: Record<3 | 4 | 5, string[]> = {
  3: ['Desayuno', 'Comida', 'Cena'],
  4: ['Desayuno', 'Colacion AM', 'Comida', 'Cena'],
  5: ['Desayuno', 'Colacion AM', 'Comida', 'Colacion PM', 'Cena'],
};

type GoalKey = 'lose_fat' | 'maintain' | 'gain_muscle';
type MealsCount = 3 | 4 | 5;
type PlanningFocus = PatientProfile['planningFocus'];

const HALF_EXCHANGE_UNITS = 2;
const HALF_STEP = 0.5;
const MAX_REBALANCE_ITERATIONS = 400;
const MAIN_MEAL_TOLERANCE_PCT = 5;

const HYBRID_BASE_MEAL_TARGETS: Record<MealsCount, number[]> = {
  3: [33.34, 33.33, 33.33],
  4: [30, 10, 30, 30],
  5: [28, 8, 28, 8, 28],
};

const HYBRID_MAIN_MEAL_INDEXES: Record<MealsCount, number[]> = {
  3: [0, 1, 2],
  4: [0, 2, 3],
  5: [0, 2, 4],
};

const HYBRID_SNACK_MEAL_INDEXES: Record<MealsCount, number[]> = {
  3: [],
  4: [1],
  5: [1, 3],
};

const cloneMatrix = (matrix: Record<string, number[]>): Record<string, number[]> =>
  Object.fromEntries(Object.entries(matrix).map(([key, value]) => [key, [...value]]));

const BASE_MATRIX_3: Record<string, number[]> = {
  vegetable: [15, 45, 40],
  fruit: [50, 25, 25],
  carb: [30, 40, 30],
  legume: [0, 60, 40],
  protein: [25, 40, 35],
  milk: [50, 0, 50],
  fat: [30, 35, 35],
  sugar: [50, 50, 0],
};

const BASE_MATRIX_4: Record<string, number[]> = {
  vegetable: [15, 10, 40, 35],
  fruit: [35, 30, 20, 15],
  carb: [25, 15, 35, 25],
  legume: [20, 0, 50, 30],
  protein: [25, 0, 40, 35],
  milk: [40, 30, 0, 30],
  fat: [25, 10, 35, 30],
  sugar: [30, 40, 30, 0],
};

const BASE_MATRIX_5: Record<string, number[]> = {
  vegetable: [10, 0, 40, 5, 45],
  fruit: [25, 25, 15, 25, 10],
  carb: [25, 10, 30, 10, 25],
  legume: [0, 0, 55, 0, 45],
  protein: [20, 5, 35, 5, 35],
  milk: [35, 25, 0, 25, 15],
  fat: [25, 10, 30, 10, 25],
  sugar: [25, 25, 25, 25, 0],
};

const MX_MATRIX_4_WITH_DAIRY: Record<string, number[]> = {
  vegetable: [15, 5, 45, 35],
  fruit: [25, 40, 20, 15],
  carb: [25, 15, 35, 25],
  legume: [20, 0, 50, 30],
  protein: [25, 0, 40, 35],
  milk: [25, 45, 0, 30],
  fat: [25, 3, 40, 32],
  sugar: [45, 3, 45, 7],
};

const MX_MATRIX_4_WITHOUT_DAIRY: Record<string, number[]> = {
  ...MX_MATRIX_4_WITH_DAIRY,
  milk: [35, 10, 0, 55],
};

const MX_MATRIX_5_WITH_DAIRY: Record<string, number[]> = {
  vegetable: [10, 3, 42, 3, 42],
  fruit: [20, 30, 15, 25, 10],
  carb: [25, 10, 30, 10, 25],
  legume: [0, 0, 55, 0, 45],
  protein: [20, 5, 35, 5, 35],
  milk: [25, 30, 0, 30, 15],
  fat: [25, 3, 34, 3, 35],
  sugar: [40, 3, 40, 3, 14],
};

const MX_MATRIX_5_WITHOUT_DAIRY: Record<string, number[]> = {
  ...MX_MATRIX_5_WITH_DAIRY,
  milk: [35, 10, 0, 10, 45],
};

const normalizePercentagesTo100 = (values: number[]): number[] => {
  const safe = values.map((value) => Math.max(0, value));
  const total = safe.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return Array.from({ length: safe.length }, () => 100 / Math.max(1, safe.length));
  }

  return safe.map((value) => (value / total) * 100);
};

const getMainMealIndexes = (mealsPerDay: MealsCount): number[] =>
  HYBRID_MAIN_MEAL_INDEXES[mealsPerDay];

const getSnackMealIndexes = (mealsPerDay: MealsCount): number[] =>
  HYBRID_SNACK_MEAL_INDEXES[mealsPerDay];

const getBaseHybridTargets = (mealsPerDay: MealsCount): number[] =>
  [...HYBRID_BASE_MEAL_TARGETS[mealsPerDay]];

const applyMainMealShift = (
  values: number[],
  mealsPerDay: MealsCount,
  sourceMainMeal: 'breakfast' | 'lunch' | 'dinner',
): number[] => {
  const shifted = [...values];
  const [breakfastIndex, lunchIndex, dinnerIndex] = getMainMealIndexes(mealsPerDay);
  const indexByName = {
    breakfast: breakfastIndex ?? 0,
    lunch: lunchIndex ?? 0,
    dinner: dinnerIndex ?? 0,
  } as const;
  const sourceIndex = indexByName[sourceMainMeal];
  const subtract = 1.5;

  shifted[sourceIndex] = (shifted[sourceIndex] ?? 0) + 3;

  for (const [name, index] of Object.entries(indexByName) as Array<[
    keyof typeof indexByName,
    number,
  ]>) {
    if (name === sourceMainMeal) continue;
    shifted[index] = Math.max(0, (shifted[index] ?? 0) - subtract);
  }

  return normalizePercentagesTo100(shifted);
};

const buildHybridBaseTargets = (
  mealsPerDay: MealsCount,
  trainingWindow: PatientProfile['trainingWindow'],
): number[] => {
  const baseTargets = getBaseHybridTargets(mealsPerDay);
  if (trainingWindow === 'none') return baseTargets;
  if (trainingWindow === 'morning') return applyMainMealShift(baseTargets, mealsPerDay, 'breakfast');
  if (trainingWindow === 'afternoon') return applyMainMealShift(baseTargets, mealsPerDay, 'lunch');
  return applyMainMealShift(baseTargets, mealsPerDay, 'dinner');
};

const trainingWindowBonusIndices = (
  mealsPerDay: MealsCount,
  trainingWindow: PatientProfile['trainingWindow'],
): number[] => {
  if (trainingWindow === 'none') return [];

  if (trainingWindow === 'morning') {
    if (mealsPerDay === 3) return [0];
    return [0, 1];
  }

  if (trainingWindow === 'afternoon') {
    if (mealsPerDay === 3) return [1];
    return [2];
  }

  if (mealsPerDay === 5) return [3, 4];
  return [mealsPerDay - 1];
};

const applyTrainingWindowBonus = (
  values: number[],
  mealsPerDay: MealsCount,
  trainingWindow: PatientProfile['trainingWindow'],
): number[] => {
  const indices = trainingWindowBonusIndices(mealsPerDay, trainingWindow);
  if (indices.length === 0) return values;

  const withBonus = [...values];
  const perIndexBonus = 10 / indices.length;

  for (const index of indices) {
    if (index < 0 || index >= withBonus.length) continue;
    withBonus[index] = (withBonus[index] ?? 0) + perIndexBonus;
  }

  return normalizePercentagesTo100(withBonus);
};

const applyGoalAdjustments = (
  matrix: Record<string, number[]>,
  mealsPerDay: MealsCount,
  goal: GoalKey,
): void => {
  if (goal === 'lose_fat') {
    matrix.carb = mealsPerDay === 3
      ? [35, 40, 25]
      : mealsPerDay === 4
        ? [30, 10, 40, 20]
        : [25, 10, 35, 10, 20];

    if (mealsPerDay === 3) {
      matrix.fruit = [60, 25, 15];
    }
  }

  if (goal === 'gain_muscle') {
    matrix.carb = mealsPerDay === 3
      ? [30, 35, 35]
      : mealsPerDay === 4
        ? [25, 15, 30, 30]
        : [20, 15, 25, 15, 25];

    matrix.protein = mealsPerDay === 3
      ? [30, 35, 35]
      : mealsPerDay === 4
        ? [25, 5, 35, 35]
        : [20, 10, 30, 10, 30];
  }
};

const getHybridDistributionMatrix = (
  mealsPerDay: MealsCount,
  trainingWindow: PatientProfile['trainingWindow'],
): Record<string, number[]> => {
  const baseTargets = getBaseHybridTargets(mealsPerDay);
  const carbProteinTargets = buildHybridBaseTargets(mealsPerDay, trainingWindow);

  return {
    vegetable: [...baseTargets],
    fruit: [...baseTargets],
    carb: carbProteinTargets,
    legume: [...baseTargets],
    protein: carbProteinTargets,
    milk: [...baseTargets],
    fat: [...baseTargets],
    sugar: [...baseTargets],
  };
};

const getDistributionMatrix = (
  mealsPerDay: MealsCount,
  goal: GoalKey,
  planningFocus: PlanningFocus,
  systemId?: ExchangeSystemId,
  usesDairyInSnacks = true,
  trainingWindow: PatientProfile['trainingWindow'] = 'none',
  dietPattern?: DietPattern,
): Record<string, number[]> => {
  void dietPattern;

  if (planningFocus === 'hybrid_sport') {
    return getHybridDistributionMatrix(mealsPerDay, trainingWindow);
  }

  const isMx = systemId === 'mx_smae';
  const shouldUseMxMatrix = isMx && (mealsPerDay === 4 || mealsPerDay === 5);

  let matrix: Record<string, number[]>;

  if (shouldUseMxMatrix) {
    if (mealsPerDay === 4) {
      matrix = cloneMatrix(usesDairyInSnacks ? MX_MATRIX_4_WITH_DAIRY : MX_MATRIX_4_WITHOUT_DAIRY);
    } else {
      matrix = cloneMatrix(usesDairyInSnacks ? MX_MATRIX_5_WITH_DAIRY : MX_MATRIX_5_WITHOUT_DAIRY);
    }
  } else if (mealsPerDay === 3) {
    matrix = cloneMatrix(BASE_MATRIX_3);
  } else if (mealsPerDay === 4) {
    matrix = cloneMatrix(BASE_MATRIX_4);
  } else {
    matrix = cloneMatrix(BASE_MATRIX_5);
  }

  applyGoalAdjustments(matrix, mealsPerDay, goal);
  matrix.carb = applyTrainingWindowBonus(matrix.carb ?? [], mealsPerDay, trainingWindow);
  matrix.protein = applyTrainingWindowBonus(matrix.protein ?? [], mealsPerDay, trainingWindow);

  return matrix;
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

const selectPreferredSnackIndex = (
  percentages: number[],
  mealCount: number,
): number | null => {
  if (mealCount < 4) return null;

  const snackIndexes = mealCount === 5 ? [1, 3] : [1];
  let bestIndex = snackIndexes[0] ?? 0;
  let bestValue = Number.NEGATIVE_INFINITY;

  for (const snackIndex of snackIndexes) {
    const value = percentages[snackIndex] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      bestIndex = snackIndex;
    }
  }

  return bestIndex;
};

const allocateUnitsByLargestRemainder = (
  targetUnits: number,
  percentages: number[],
  preferredPrimaryIndex?: number,
): number[] => {
  const mealCount = percentages.length;
  const allocations = Array.from({ length: mealCount }, () => 0);

  if (mealCount === 0 || targetUnits <= 0) return allocations;

  const normalizedWeights = toNormalizedWeights(percentages);

  if (targetUnits <= HALF_EXCHANGE_UNITS) {
    const primaryIndex =
      typeof preferredPrimaryIndex === 'number'
        ? preferredPrimaryIndex
        : selectPrimaryMealIndex(percentages);
    allocations[primaryIndex] = targetUnits;
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

type RebalanceMode = 'energy' | 'exchange';

const isFinitePositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const shouldUseEnergyMode = (buckets: MealDistributionBucketInput[]): boolean =>
  buckets.every((bucket) =>
    bucket.exchangesPerDay <= 0 || isFinitePositiveNumber(bucket.kcalPerExchange));

const buildBucketIndex = (
  buckets: MealDistributionBucketInput[],
): Map<string, MealDistributionBucketInput> =>
  new Map(buckets.map((bucket) => [bucket.bucketKey, bucket]));

const resolveUnitValue = (
  bucket: MealDistributionBucketInput | undefined,
  mode: RebalanceMode,
): number => {
  if (!bucket) return 0;
  if (mode === 'exchange') return 1;
  return isFinitePositiveNumber(bucket.kcalPerExchange) ? bucket.kcalPerExchange : 0;
};

const computeMealTotals = (
  slots: MealSlot[],
  bucketByKey: Map<string, MealDistributionBucketInput>,
  mode: RebalanceMode,
): number[] =>
  slots.map((slot) => {
    let total = 0;
    for (const [bucketKey, exchanges] of Object.entries(slot.distribution)) {
      const bucket = bucketByKey.get(bucketKey);
      const unitValue = resolveUnitValue(bucket, mode);
      total += Math.max(0, exchanges) * unitValue;
    }
    return total;
  });

const toPercentages = (totals: number[]): number[] => {
  const sum = totals.reduce((acc, value) => acc + Math.max(0, value), 0);
  if (sum <= 0) {
    return Array.from({ length: totals.length }, () => 100 / Math.max(1, totals.length));
  }
  return totals.map((value) => (Math.max(0, value) / sum) * 100);
};

const mealValueAt = (
  slot: MealSlot,
  bucketKey: string,
): number => Math.max(0, slot.distribution[bucketKey] ?? 0);

const moveHalfExchange = (
  slots: MealSlot[],
  bucketKey: string,
  sourceMealIndex: number,
  targetMealIndex: number,
): boolean => {
  const sourceSlot = slots[sourceMealIndex];
  const targetSlot = slots[targetMealIndex];
  if (!sourceSlot || !targetSlot) return false;

  const sourceValue = mealValueAt(sourceSlot, bucketKey);
  if (sourceValue < HALF_STEP) return false;

  sourceSlot.distribution[bucketKey] = Number((sourceValue - HALF_STEP).toFixed(2));
  targetSlot.distribution[bucketKey] = Number((mealValueAt(targetSlot, bucketKey) + HALF_STEP).toFixed(2));
  return true;
};

const selectMealIndexByPercent = (
  percentages: number[],
  indexes: number[],
  mode: 'min' | 'max',
): number | null => {
  if (indexes.length === 0) return null;

  let selected = indexes[0] ?? null;
  if (selected === null) return null;

  for (const index of indexes) {
    const current = percentages[index] ?? 0;
    const best = percentages[selected] ?? 0;
    const shouldReplace = mode === 'min' ? current < best : current > best;
    if (shouldReplace) {
      selected = index;
    }
  }

  return selected;
};

const snackLimitsSatisfied = (
  percentages: number[],
  mealsPerDay: MealsCount,
): boolean => {
  if (mealsPerDay === 3) return true;

  const snackIndexes = getSnackMealIndexes(mealsPerDay);
  if (snackIndexes.length === 0) return true;

  if (mealsPerDay === 4) {
    const snackPct = percentages[snackIndexes[0] ?? 1] ?? 0;
    return snackPct <= 12;
  }

  const snackValues = snackIndexes.map((index) => percentages[index] ?? 0);
  const eachWithinLimit = snackValues.every((value) => value <= 10);
  const totalSnackPct = snackValues.reduce((acc, value) => acc + value, 0);
  return eachWithinLimit && totalSnackPct <= 20;
};

const mainMealsWithinTolerance = (
  percentages: number[],
  mealsPerDay: MealsCount,
): boolean => {
  const mainIndexes = getMainMealIndexes(mealsPerDay);
  const values = mainIndexes.map((index) => percentages[index] ?? 0);
  if (values.length === 0) return true;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max - min <= MAIN_MEAL_TOLERANCE_PCT;
};

const selectBucketToMove = (
  sourceSlot: MealSlot,
  buckets: MealDistributionBucketInput[],
  mode: RebalanceMode,
): string | null => {
  const candidates = buckets
    .filter((bucket) => mealValueAt(sourceSlot, bucket.bucketKey) >= HALF_STEP)
    .map((bucket) => ({
      bucketKey: bucket.bucketKey,
      score: resolveUnitValue(bucket, mode),
      exchanges: mealValueAt(sourceSlot, bucket.bucketKey),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.exchanges - a.exchanges ||
      a.bucketKey.localeCompare(b.bucketKey));

  return candidates[0]?.bucketKey ?? null;
};

const rebalanceHybridDistribution = (
  slots: MealSlot[],
  buckets: MealDistributionBucketInput[],
  mealsPerDay: MealsCount,
  mode: RebalanceMode,
): void => {
  if (slots.length === 0 || buckets.length === 0) return;

  const mainIndexes = getMainMealIndexes(mealsPerDay);
  const snackIndexes = getSnackMealIndexes(mealsPerDay);
  if (mainIndexes.length === 0) return;

  const bucketByKey = buildBucketIndex(buckets);

  for (let iteration = 0; iteration < MAX_REBALANCE_ITERATIONS; iteration += 1) {
    const totals = computeMealTotals(slots, bucketByKey, mode);
    const percentages = toPercentages(totals);

    if (mainMealsWithinTolerance(percentages, mealsPerDay) &&
      snackLimitsSatisfied(percentages, mealsPerDay)) {
      break;
    }

    let sourceMealIndex: number | null = null;
    let targetMealIndex: number | null = null;

    if (mealsPerDay === 4) {
      const snackIndex = snackIndexes[0] ?? 1;
      const snackPct = percentages[snackIndex] ?? 0;
      if (snackPct > 12) {
        sourceMealIndex = snackIndex;
        targetMealIndex = selectMealIndexByPercent(percentages, mainIndexes, 'min');
      }
    }

    if (mealsPerDay === 5 && sourceMealIndex === null) {
      const snackValues = snackIndexes.map((index) => ({
        index,
        pct: percentages[index] ?? 0,
      }));
      const snackOverEach = snackValues
        .filter((snack) => snack.pct > 10)
        .sort((a, b) => b.pct - a.pct);

      if (snackOverEach.length > 0) {
        sourceMealIndex = snackOverEach[0]?.index ?? null;
        targetMealIndex = selectMealIndexByPercent(percentages, mainIndexes, 'min');
      } else {
        const snackTotal = snackValues.reduce((acc, snack) => acc + snack.pct, 0);
        if (snackTotal > 20) {
          const highestSnack = snackValues.sort((a, b) => b.pct - a.pct)[0];
          sourceMealIndex = highestSnack?.index ?? null;
          targetMealIndex = selectMealIndexByPercent(percentages, mainIndexes, 'min');
        }
      }
    }

    if (sourceMealIndex === null || targetMealIndex === null) {
      if (!mainMealsWithinTolerance(percentages, mealsPerDay)) {
        sourceMealIndex = selectMealIndexByPercent(percentages, mainIndexes, 'max');
        targetMealIndex = selectMealIndexByPercent(percentages, mainIndexes, 'min');
      }
    }

    if (sourceMealIndex === null || targetMealIndex === null || sourceMealIndex === targetMealIndex) {
      break;
    }

    const bucketKey = selectBucketToMove(slots[sourceMealIndex] as MealSlot, buckets, mode);
    if (!bucketKey) break;

    const moved = moveHalfExchange(slots, bucketKey, sourceMealIndex, targetMealIndex);
    if (!moved) break;
  }
};

export const distributeMeals = (
  bucketPlan: MealDistributionBucketInput[],
  profile: Pick<PatientProfile, 'mealsPerDay' | 'goal'> &
    Partial<
      Pick<
        PatientProfile,
        'systemId' | 'dietPattern' | 'trainingWindow' | 'usesDairyInSnacks' | 'planningFocus'
      >
    >,
): MealDistributionPlan => {
  const meals = profile.mealsPerDay as MealsCount;
  const mealNames = MEAL_NAMES[meals] ?? MEAL_NAMES[3];
  const goalKey = (profile.goal ?? 'maintain') as GoalKey;
  const planningFocus = profile.planningFocus ?? 'clinical';
  const isMx = profile.systemId === 'mx_smae';
  const matrix = getDistributionMatrix(
    meals,
    goalKey,
    planningFocus,
    profile.systemId,
    profile.usesDairyInSnacks ?? true,
    profile.trainingWindow ?? 'none',
    profile.dietPattern,
  );
  const effectiveBuckets = selectEffectiveBuckets(bucketPlan);
  const mealCount = mealNames.length;

  const slots: MealSlot[] = mealNames.map((name, mealIdx) => {
    const distribution: Record<string, number> = {};

    for (const bucket of effectiveBuckets) {
      const family = getFamilyForBucket(bucket);
      const percentages = getPercentagesForMeals(matrix[family], mealCount);
      const targetUnits = toHalfUnits(bucket.exchangesPerDay);
      const shouldPreferSnackForSmallBucket =
        planningFocus !== 'hybrid_sport' &&
        isMx &&
        targetUnits <= HALF_EXCHANGE_UNITS &&
        mealCount >= 4 &&
        (family === 'fruit' || (family === 'milk' && (profile.usesDairyInSnacks ?? true)));
      const preferredPrimaryIndex = shouldPreferSnackForSmallBucket
        ? selectPreferredSnackIndex(percentages, mealCount)
        : null;

      if (targetUnits <= 0) {
        distribution[bucket.bucketKey] = 0;
        continue;
      }

      const unitsByMeal = allocateUnitsByLargestRemainder(
        targetUnits,
        percentages,
        preferredPrimaryIndex ?? undefined,
      );
      distribution[bucket.bucketKey] = fromHalfUnits(unitsByMeal[mealIdx] ?? 0);
    }

    return { name, distribution };
  });

  if (planningFocus === 'hybrid_sport') {
    const mode: RebalanceMode = shouldUseEnergyMode(effectiveBuckets) ? 'energy' : 'exchange';
    rebalanceHybridDistribution(slots, effectiveBuckets, meals, mode);
  }

  return slots;
};

export { MEAL_NAMES };
