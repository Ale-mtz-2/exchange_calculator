import { describe, expect, it } from 'vitest';

import { patientProfileSchema } from '../src/schemas';

const basePayload = {
  goal: 'lose_fat' as const,
  sex: 'female' as const,
  age: 32,
  weightKg: 68,
  heightCm: 166,
  activityLevel: 'medium' as const,
  mealsPerDay: 4 as const,
  countryCode: 'MX' as const,
  stateCode: 'CMX',
  systemId: 'mx_smae' as const,
  formulaId: 'mifflin_st_jeor' as const,
  dietPattern: 'omnivore' as const,
  allergies: [],
  intolerances: [],
  likes: [],
  dislikes: [],
  budgetLevel: 'medium' as const,
  prepTimeLevel: 'medium' as const,
};

describe('patientProfileSchema', () => {
  it('normalizes legacy goalDeltaKg into weekly field', () => {
    const parsed = patientProfileSchema.parse({
      ...basePayload,
      goal: 'lose_fat',
      goalDeltaKg: 6,
    });

    expect(parsed.goalDeltaKgPerWeek).toBeGreaterThanOrEqual(0.25);
    expect(parsed.goalDeltaKgPerWeek).toBeLessThanOrEqual(0.75);
  });

  it('uses weekly field when provided', () => {
    const parsed = patientProfileSchema.parse({
      ...basePayload,
      goal: 'gain_muscle',
      goalDeltaKgPerWeek: 0.25,
    });

    expect(parsed.goalDeltaKgPerWeek).toBe(0.25);
  });

  it('forces zero weekly delta in maintain goal', () => {
    const parsed = patientProfileSchema.parse({
      ...basePayload,
      goal: 'maintain',
      goalDeltaKgPerWeek: 0.5,
    });

    expect(parsed.goalDeltaKgPerWeek).toBe(0);
  });
});
