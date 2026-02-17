import { describe, expect, it } from 'vitest';

import type { PatientProfile } from '../src/types';
import type { FoodItem } from '../src/types';
import { rankFoods } from '../src/algorithms/ranking';
import type { KcalSelectionPolicyDefinition } from '../src/catalog/systems';

const baseProfile: PatientProfile = {
  goal: 'maintain',
  goalDeltaKgPerWeek: 0,
  sex: 'female',
  age: 30,
  weightKg: 70,
  heightCm: 165,
  activityLevel: 'medium',
  mealsPerDay: 4,
  countryCode: 'MX',
  stateCode: 'CMX',
  systemId: 'mx_smae',
  formulaId: 'mifflin_st_jeor',
  dietPattern: 'omnivore',
  allergies: [],
  intolerances: [],
  likes: [],
  dislikes: [],
  budgetLevel: 'medium',
  prepTimeLevel: 'medium',
};

const kcalPolicy: KcalSelectionPolicyDefinition = {
  systemId: 'mx_smae',
  lowTargetKcal: 1600,
  highTargetKcal: 3000,
  minTolerancePct: 0.2,
  maxTolerancePct: 0.6,
  minToleranceKcal: 25,
  softPenaltyPer10Pct: 2.5,
  hardOutlierMultiplier: 2.8,
  excludeHardOutliers: true,
};

const baseFood: FoodItem = {
  id: 1,
  name: 'Test food',
  groupCode: 'carb',
  carbsG: 25,
  proteinG: 4,
  fatG: 3,
  caloriesKcal: 170,
  servingQty: 100,
  servingUnit: 'g',
};

describe('rankFoods kcal policy', () => {
  it('penalizes excess kcal more when target calories are lower', () => {
    const lowTargetResult = rankFoods(
      [baseFood],
      baseProfile,
      {
        targetCalories: 1500,
        bucketKcalTargets: { carb: 100 },
        kcalPolicy,
      },
    )[0];

    const highTargetResult = rankFoods(
      [baseFood],
      baseProfile,
      {
        targetCalories: 3200,
        bucketKcalTargets: { carb: 100 },
        kcalPolicy,
      },
    )[0];

    const lowImpact = lowTargetResult.reasons.find((reason) => reason.code === 'kcal_fit')?.impact ?? 0;
    const highImpact = highTargetResult.reasons.find((reason) => reason.code === 'kcal_fit')?.impact ?? 0;

    expect(lowImpact).toBeLessThan(highImpact);
  });

  it('excludes hard outliers when configured', () => {
    const outlier: FoodItem = {
      ...baseFood,
      id: 2,
      caloriesKcal: 550,
    };

    const ranked = rankFoods(
      [outlier],
      baseProfile,
      {
        targetCalories: 1800,
        bucketKcalTargets: { carb: 100 },
        kcalPolicy,
      },
    );

    expect(ranked).toHaveLength(0);
  });

  it('keeps allergy/intolerance blocking priority', () => {
    const allergenFood: FoodItem = {
      ...baseFood,
      id: 3,
      tags: [{ type: 'allergen', value: 'nuez' }],
    };

    const ranked = rankFoods(
      [allergenFood],
      { ...baseProfile, allergies: ['nuez'] },
      {
        targetCalories: 2500,
        bucketKcalTargets: { carb: 100 },
        kcalPolicy,
      },
    );

    expect(ranked).toHaveLength(0);
  });
});

describe('rankFoods geo metadata fallback', () => {
  it('uses country match and does not add fallback when country availability exists', () => {
    const ranked = rankFoods(
      [
        {
          ...baseFood,
          id: 10,
          countryAvailability: ['MX'],
        },
      ],
      baseProfile,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'country_match')).toBe(true);
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'fallback_neutral')).toBe(false);
  });

  it('keeps fallback when no geo metadata is present', () => {
    const ranked = rankFoods([{ ...baseFood, id: 11 }], baseProfile);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'fallback_neutral')).toBe(true);
  });

  it('does not add fallback when geoWeight exists without country/state lists', () => {
    const ranked = rankFoods(
      [
        {
          ...baseFood,
          id: 12,
          geoWeight: 1,
        },
      ],
      baseProfile,
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.reasons.some((reason) => reason.code === 'fallback_neutral')).toBe(false);
  });
});
