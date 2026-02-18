import type { MealDistributionPlan } from '@equivalentes/shared';
import { describe, expect, it } from 'vitest';

import {
  applyMealCellStep,
  filterRebalanceCandidates,
  mergeMealOverrides,
  normalizeBucketMealRow,
} from './mealCellAdjustments';

const MEALS = ['Desayuno', 'Comida', 'Cena'];

const baselineDistribution: MealDistributionPlan = [
  { name: 'Desayuno', distribution: { 'group:1': 1 } },
  { name: 'Comida', distribution: { 'group:1': 1.5 } },
  { name: 'Cena', distribution: { 'group:1': 1.5 } },
];

describe('mealCellAdjustments', () => {
  it('increments target meal cell by 0.5 and keeps total in sync', () => {
    const next = applyMealCellStep(
      { Desayuno: 1, Comida: 1.5, Cena: 1.5 },
      'Comida',
      0.5,
      4.5,
      MEALS,
    );

    expect(next.Comida).toBe(2);
    expect((next.Desayuno ?? 0) + (next.Comida ?? 0) + (next.Cena ?? 0)).toBe(4.5);
  });

  it('does not go below zero when decrementing', () => {
    const next = applyMealCellStep(
      { Desayuno: 0, Comida: 2, Cena: 2 },
      'Desayuno',
      -0.5,
      4,
      MEALS,
    );

    expect(next.Desayuno).toBe(0);
    expect((next.Desayuno ?? 0) + (next.Comida ?? 0) + (next.Cena ?? 0)).toBe(4);
  });

  it('supports creating a bucket from zero in a specific meal', () => {
    const next = applyMealCellStep(
      { Desayuno: 0, Comida: 0, Cena: 0 },
      'Cena',
      0.5,
      0.5,
      MEALS,
    );

    expect(next.Cena).toBe(0.5);
    expect((next.Desayuno ?? 0) + (next.Comida ?? 0) + (next.Cena ?? 0)).toBe(0.5);
  });

  it('normalizes values to half-step increments', () => {
    const normalized = normalizeBucketMealRow(
      { Desayuno: 0.24, Comida: 1.76, Cena: 2.1 },
      4,
      'Comida',
      MEALS,
    );

    expect(Number.isInteger((normalized.Desayuno ?? 0) * 2)).toBe(true);
    expect(Number.isInteger((normalized.Comida ?? 0) * 2)).toBe(true);
    expect(Number.isInteger((normalized.Cena ?? 0) * 2)).toBe(true);
    expect((normalized.Desayuno ?? 0) + (normalized.Comida ?? 0) + (normalized.Cena ?? 0)).toBe(4);
  });

  it('excludes manually edited buckets from rebalance candidates', () => {
    const rows = [
      { bucketKey: 'group:1' },
      { bucketKey: 'group:2' },
      { bucketKey: 'group:3' },
    ];
    const locked = new Set(['group:2']);

    const eligible = filterRebalanceCandidates(rows, 'group:1', locked);
    expect(eligible.map((row) => row.bucketKey)).toEqual(['group:3']);
  });

  it('removes bucket override when row returns to baseline', () => {
    const next = mergeMealOverrides(
      {
        'group:1': { Desayuno: 1.5, Comida: 1.5, Cena: 1.5 },
      },
      'group:1',
      { Desayuno: 1, Comida: 1.5, Cena: 1.5 },
      baselineDistribution,
      MEALS,
    );

    expect(next['group:1']).toBeUndefined();
  });
});
