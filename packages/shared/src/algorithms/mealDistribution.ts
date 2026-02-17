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
      vegetable: [10, 5, 45, 40],
      fruit: [35, 30, 20, 15],
      carb: [25, 15, 35, 25],
      legume: [0, 0, 60, 40],
      protein: [25, 0, 40, 35],
      milk: [40, 30, 0, 30],
      fat: [25, 15, 30, 30],
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

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

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

export const distributeMeals = (
  bucketPlan: MealDistributionBucketInput[],
  profile: Pick<PatientProfile, 'mealsPerDay' | 'goal'>,
): MealDistributionPlan => {
  const meals = profile.mealsPerDay as 3 | 4 | 5;
  const mealNames = MEAL_NAMES[meals] ?? MEAL_NAMES[3];
  const goalKey = (profile.goal ?? 'maintain') as GoalKey;
  const matrix = getDistributionMatrix(meals, goalKey);

  const familyTotals = new Map<string, number>();
  for (const bucket of bucketPlan) {
    const family = getFamilyForBucket(bucket);
    familyTotals.set(family, (familyTotals.get(family) ?? 0) + bucket.exchangesPerDay);
  }

  const slots: MealSlot[] = mealNames.map((name, mealIdx) => {
    const distribution: Record<string, number> = {};

    for (const bucket of bucketPlan) {
      const family = getFamilyForBucket(bucket);
      const pcts = matrix[family];
      const dailyTotal = bucket.exchangesPerDay;

      if (!pcts || dailyTotal <= 0) {
        distribution[bucket.bucketKey] = 0;
        continue;
      }

      const familyTotal = familyTotals.get(family) ?? dailyTotal;
      const subgroupWeight = familyTotal > 0 ? dailyTotal / familyTotal : 0;
      const familyMealAlloc = ((pcts[mealIdx] ?? 0) / 100) * familyTotal;
      const raw = familyMealAlloc * subgroupWeight;
      distribution[bucket.bucketKey] = roundHalf(raw);
    }

    return { name, distribution };
  });

  for (const bucket of bucketPlan) {
    const code = bucket.bucketKey;
    const target = bucket.exchangesPerDay;
    const sumAcrossMeals = slots.reduce((sum, slot) => sum + (slot.distribution[code] ?? 0), 0);
    const diff = roundHalf(target - sumAcrossMeals);

    if (Math.abs(diff) < 0.5) continue;

    const family = getFamilyForBucket(bucket);
    const pcts = matrix[family] ?? [];
    const maxMealIdx = pcts.indexOf(Math.max(...pcts));
    const idx = maxMealIdx >= 0 ? maxMealIdx : 0;
    const slot = slots[idx];
    if (!slot) continue;
    slot.distribution[code] = roundHalf((slot.distribution[code] ?? 0) + diff);
  }

  return slots;
};

export { MEAL_NAMES };
