import { describe, expect, it } from 'vitest';

import {
  selectCanonicalNutritionValue,
  type NutritionValueCandidate,
} from '../src/services/nutritionValueResolver.js';

const candidate = (partial: Partial<NutritionValueCandidate>): NutritionValueCandidate => ({
  id: partial.id ?? 1,
  foodId: partial.foodId ?? 10,
  dataSourceId: partial.dataSourceId ?? null,
  state: partial.state ?? null,
  caloriesKcal: partial.caloriesKcal === undefined ? 100 : partial.caloriesKcal,
  proteinG: partial.proteinG === undefined ? 10 : partial.proteinG,
  carbsG: partial.carbsG === undefined ? 10 : partial.carbsG,
  fatG: partial.fatG === undefined ? 5 : partial.fatG,
  servingQty: partial.servingQty === undefined ? 100 : partial.servingQty,
  servingUnit: partial.servingUnit ?? 'g',
});

describe('nutritionValueResolver.selectCanonicalNutritionValue', () => {
  it('prioritizes standard state first', () => {
    const selected = selectCanonicalNutritionValue(
      [
        candidate({ id: 100, state: 'draft' }),
        candidate({ id: 101, state: 'standard' }),
      ],
      new Map(),
    );

    expect(selected?.nutritionValueId).toBe(101);
  });

  it('uses source priority after state', () => {
    const selected = selectCanonicalNutritionValue(
      [
        candidate({ id: 100, state: 'standard', dataSourceId: 1 }),
        candidate({ id: 101, state: 'standard', dataSourceId: 2 }),
      ],
      new Map([
        [1, 5],
        [2, 1],
      ]),
    );

    expect(selected?.nutritionValueId).toBe(101);
  });

  it('returns null when no utilizable row exists', () => {
    const selected = selectCanonicalNutritionValue(
      [
        candidate({ id: 100, caloriesKcal: null }),
        candidate({ id: 101, proteinG: null }),
      ],
      new Map(),
    );

    expect(selected).toBeNull();
  });
});
