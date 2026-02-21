import { describe, expect, it } from 'vitest';

import { distributeMeals } from '../src/algorithms/mealDistribution';
import type { MealDistributionBucketInput, PatientProfile } from '../src/types';

const profile4Meals: Pick<PatientProfile, 'mealsPerDay' | 'goal'> = {
  mealsPerDay: 4,
  goal: 'maintain',
};

const profile4MealsMx: Pick<PatientProfile, 'mealsPerDay' | 'goal' | 'systemId' | 'usesDairyInSnacks'> = {
  mealsPerDay: 4,
  goal: 'maintain',
  systemId: 'mx_smae',
  usesDairyInSnacks: true,
};

const profile5MealsHybrid: Pick<
PatientProfile,
'mealsPerDay' | 'goal' | 'planningFocus' | 'trainingWindow'
> = {
  mealsPerDay: 5,
  goal: 'maintain',
  planningFocus: 'hybrid_sport',
  trainingWindow: 'none',
};

const profile4MealsHybrid: Pick<
PatientProfile,
'mealsPerDay' | 'goal' | 'planningFocus' | 'trainingWindow'
> = {
  mealsPerDay: 4,
  goal: 'maintain',
  planningFocus: 'hybrid_sport',
  trainingWindow: 'none',
};

const sumByBucket = (
  slots: ReturnType<typeof distributeMeals>,
  bucketKey: string,
): number => slots.reduce((sum, slot) => sum + (slot.distribution[bucketKey] ?? 0), 0);

const energyPercentByMeal = (
  slots: ReturnType<typeof distributeMeals>,
  buckets: MealDistributionBucketInput[],
): Record<string, number> => {
  const kcalByBucket = new Map(
    buckets.map((bucket) => [bucket.bucketKey, bucket.kcalPerExchange ?? 0]),
  );

  const totalsByMeal = slots.map((slot) =>
    Object.entries(slot.distribution).reduce((sum, [bucketKey, exchanges]) =>
      sum + exchanges * (kcalByBucket.get(bucketKey) ?? 0), 0));

  const dailyTotal = totalsByMeal.reduce((sum, value) => sum + value, 0);
  if (dailyTotal <= 0) {
    return Object.fromEntries(slots.map((slot) => [slot.name, 0]));
  }

  return Object.fromEntries(
    slots.map((slot, index) => [slot.name, (totalsByMeal[index] ?? 0) / dailyTotal * 100]),
  );
};

describe('distributeMeals', () => {
  it('assigns legume exchanges to breakfast in 4 meals', () => {
    const bucketKey = 'subgroup:201';
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey,
        legacyCode: 'legume',
        exchangesPerDay: 7,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4Meals);

    expect(slots[0]?.distribution[bucketKey]).toBeGreaterThan(0);
    expect(sumByBucket(slots, bucketKey)).toBe(7);
  });

  it('concentrates small buckets (<=1.0) in one meal', () => {
    const bucketKey = 'subgroup:301';
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey,
        legacyCode: 'grasa_con_proteina',
        exchangesPerDay: 1,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4Meals);
    const values = slots.map((slot) => slot.distribution[bucketKey] ?? 0);

    expect(values.filter((value) => value > 0)).toHaveLength(1);
    expect(values[2]).toBe(1);
    expect(sumByBucket(slots, bucketKey)).toBe(1);
  });

  it('keeps exact half-step totals per bucket', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey: 'group:8',
        legacyCode: 'carb',
        exchangesPerDay: 3.5,
      },
      {
        bucketKey: 'group:2',
        legacyCode: 'fruit',
        exchangesPerDay: 2.5,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4Meals);

    for (const bucket of bucketPlan) {
      const sum = sumByBucket(slots, bucket.bucketKey);
      expect(sum).toBe(bucket.exchangesPerDay);
      for (const slot of slots) {
        const value = slot.distribution[bucket.bucketKey] ?? 0;
        expect(Number.isInteger(value * 2)).toBe(true);
      }
    }
  });

  it('dedupes parent group when subgroup metadata is present', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey: 'group:6',
        legacyCode: 'milk',
        bucketType: 'group',
        bucketId: 6,
        exchangesPerDay: 2,
      },
      {
        bucketKey: 'subgroup:16',
        legacyCode: 'leche_semidescremada',
        bucketType: 'subgroup',
        bucketId: 16,
        parentGroupId: 6,
        exchangesPerDay: 1,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4Meals);

    expect(slots.every((slot) => slot.distribution['group:6'] === undefined)).toBe(true);
    expect(sumByBucket(slots, 'subgroup:16')).toBe(1);
  });

  it('keeps legacy behavior when metadata is missing', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey: 'group:6',
        legacyCode: 'milk',
        exchangesPerDay: 2,
      },
      {
        bucketKey: 'subgroup:16',
        legacyCode: 'leche_semidescremada',
        exchangesPerDay: 1,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4Meals);

    expect(slots.some((slot) => slot.distribution['group:6'] !== undefined)).toBe(true);
    expect(slots.some((slot) => slot.distribution['subgroup:16'] !== undefined)).toBe(true);
  });

  it('prioritizes fruit and milk in mx_smae snack slot for 4 meals', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey: 'group:fruit',
        legacyCode: 'fruit',
        exchangesPerDay: 1,
      },
      {
        bucketKey: 'subgroup:milk',
        legacyCode: 'leche_semidescremada',
        exchangesPerDay: 1,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4MealsMx);
    const snack = slots.find((slot) => slot.name === 'Colacion AM');

    expect(snack?.distribution['group:fruit']).toBeGreaterThan(0);
    expect(snack?.distribution['subgroup:milk']).toBeGreaterThan(0);
    expect(sumByBucket(slots, 'group:fruit')).toBe(1);
    expect(sumByBucket(slots, 'subgroup:milk')).toBe(1);
  });

  it('keeps snack sugar/fat lower than lunch for mx_smae 4 meals', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      {
        bucketKey: 'subgroup:sugar',
        legacyCode: 'azucar_sin_grasa',
        exchangesPerDay: 4,
      },
      {
        bucketKey: 'subgroup:fat',
        legacyCode: 'grasa_sin_proteina',
        exchangesPerDay: 4,
      },
    ];

    const slots = distributeMeals(bucketPlan, profile4MealsMx);
    const snack = slots.find((slot) => slot.name === 'Colacion AM');
    const lunch = slots.find((slot) => slot.name === 'Comida');

    expect((snack?.distribution['subgroup:sugar'] ?? 0)).toBeLessThan(lunch?.distribution['subgroup:sugar'] ?? 0);
    expect((snack?.distribution['subgroup:fat'] ?? 0)).toBeLessThan(lunch?.distribution['subgroup:fat'] ?? 0);
  });

  it('keeps main meals within 5pp and light snacks for hybrid_sport (5 meals)', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      { bucketKey: 'veg', legacyCode: 'vegetable', exchangesPerDay: 6, kcalPerExchange: 25 },
      { bucketKey: 'fruit', legacyCode: 'fruit', exchangesPerDay: 5, kcalPerExchange: 60 },
      { bucketKey: 'carb', legacyCode: 'cereal_sin_grasa', exchangesPerDay: 8, kcalPerExchange: 70 },
      { bucketKey: 'protein', legacyCode: 'aoa_bajo_grasa', exchangesPerDay: 7, kcalPerExchange: 55 },
      { bucketKey: 'legume', legacyCode: 'legume', exchangesPerDay: 4, kcalPerExchange: 120 },
      { bucketKey: 'fat', legacyCode: 'grasa_sin_proteina', exchangesPerDay: 3, kcalPerExchange: 45 },
    ];

    const slots = distributeMeals(bucketPlan, profile5MealsHybrid);
    const pct = energyPercentByMeal(slots, bucketPlan);
    const mainMeals = [pct.Desayuno ?? 0, pct.Comida ?? 0, pct.Cena ?? 0];

    expect(Math.max(...mainMeals) - Math.min(...mainMeals)).toBeLessThanOrEqual(5);
    expect(pct['Colacion AM'] ?? 0).toBeLessThanOrEqual(10);
    expect(pct['Colacion PM'] ?? 0).toBeLessThanOrEqual(10);
    expect((pct['Colacion AM'] ?? 0) + (pct['Colacion PM'] ?? 0)).toBeLessThanOrEqual(20);
  });

  it('prioritizes lunch carb/protein load for hybrid_sport afternoon training', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      { bucketKey: 'carb', legacyCode: 'cereal_sin_grasa', exchangesPerDay: 10, kcalPerExchange: 70 },
      { bucketKey: 'protein', legacyCode: 'aoa_bajo_grasa', exchangesPerDay: 10, kcalPerExchange: 55 },
      { bucketKey: 'fat', legacyCode: 'grasa_sin_proteina', exchangesPerDay: 2, kcalPerExchange: 45 },
    ];

    const slots = distributeMeals(bucketPlan, {
      ...profile5MealsHybrid,
      trainingWindow: 'afternoon',
    });

    const carbProteinLoad = Object.fromEntries(slots.map((slot) => ([
      slot.name,
      (slot.distribution.carb ?? 0) + (slot.distribution.protein ?? 0),
    ])));

    expect((carbProteinLoad.Comida ?? 0)).toBeGreaterThanOrEqual(carbProteinLoad.Desayuno ?? 0);
    expect((carbProteinLoad.Comida ?? 0)).toBeGreaterThanOrEqual(carbProteinLoad.Cena ?? 0);
  });

  it('keeps snack under 12pp and balances main meals for hybrid_sport (4 meals)', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      { bucketKey: 'carb', legacyCode: 'cereal_sin_grasa', exchangesPerDay: 8, kcalPerExchange: 70 },
      { bucketKey: 'protein', legacyCode: 'aoa_bajo_grasa', exchangesPerDay: 8, kcalPerExchange: 55 },
      { bucketKey: 'fruit', legacyCode: 'fruit', exchangesPerDay: 4, kcalPerExchange: 60 },
      { bucketKey: 'fat', legacyCode: 'grasa_sin_proteina', exchangesPerDay: 3, kcalPerExchange: 45 },
    ];

    const slots = distributeMeals(bucketPlan, profile4MealsHybrid);
    const pct = energyPercentByMeal(slots, bucketPlan);
    const mainMeals = [pct.Desayuno ?? 0, pct.Comida ?? 0, pct.Cena ?? 0];

    expect(Math.max(...mainMeals) - Math.min(...mainMeals)).toBeLessThanOrEqual(5);
    expect(pct['Colacion AM'] ?? 0).toBeLessThanOrEqual(12);
  });

  it('keeps clinical planning focus behavior equal to legacy default behavior', () => {
    const bucketPlan: MealDistributionBucketInput[] = [
      { bucketKey: 'fruit', legacyCode: 'fruit', exchangesPerDay: 2 },
      { bucketKey: 'protein', legacyCode: 'aoa_bajo_grasa', exchangesPerDay: 4 },
      { bucketKey: 'fat', legacyCode: 'grasa_sin_proteina', exchangesPerDay: 2 },
    ];

    const defaultSlots = distributeMeals(bucketPlan, {
      mealsPerDay: 4,
      goal: 'maintain',
      systemId: 'mx_smae',
      usesDairyInSnacks: true,
    });

    const clinicalSlots = distributeMeals(bucketPlan, {
      mealsPerDay: 4,
      goal: 'maintain',
      systemId: 'mx_smae',
      usesDairyInSnacks: true,
      planningFocus: 'clinical',
    });

    expect(clinicalSlots).toEqual(defaultSlots);
  });
});
