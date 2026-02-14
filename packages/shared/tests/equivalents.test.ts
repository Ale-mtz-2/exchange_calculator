import { describe, expect, it } from 'vitest';

import { buildEquivalentPlan, parseEquivalentQuantity } from '../src/algorithms/equivalents';
import { DEFAULT_GROUPS_BY_SYSTEM } from '../src/catalog/systems';
import type { EnergyTargets } from '../src/types';

const targets: EnergyTargets = {
  bmr: 1500,
  tdee: 2200,
  targetCalories: 2000,
  carbsG: 250,
  proteinG: 120,
  fatG: 65,
};

describe('buildEquivalentPlan', () => {
  it('returns exchange plan for all groups', () => {
    const groups = DEFAULT_GROUPS_BY_SYSTEM.mx_smae;
    const plan = buildEquivalentPlan(targets, groups);

    expect(plan.length).toBe(groups.length);
    expect(plan.every((item) => item.exchangesPerDay >= 0)).toBe(true);
  });
});

describe('parseEquivalentQuantity', () => {
  it('parses string values and rounds to half', () => {
    expect(parseEquivalentQuantity('3.26')).toBe(3.5);
    expect(parseEquivalentQuantity('2,24')).toBe(2);
  });

  it('returns zero for invalid values', () => {
    expect(parseEquivalentQuantity('abc')).toBe(0);
  });
});
