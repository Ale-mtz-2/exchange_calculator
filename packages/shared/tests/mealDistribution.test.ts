import { describe, expect, it } from 'vitest';

import { distributeMeals } from '../src/algorithms/mealDistribution';
import type { MealDistributionBucketInput, PatientProfile } from '../src/types';

const profile4Meals: Pick<PatientProfile, 'mealsPerDay' | 'goal'> = {
  mealsPerDay: 4,
  goal: 'maintain',
};

const sumByBucket = (
  slots: ReturnType<typeof distributeMeals>,
  bucketKey: string,
): number => slots.reduce((sum, slot) => sum + (slot.distribution[bucketKey] ?? 0), 0);

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
});
