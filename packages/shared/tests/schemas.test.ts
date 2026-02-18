import { describe, expect, it } from 'vitest';

import { patientProfileSchema } from '../src/schemas';

const basePayload = {
  fullName: 'Paciente Demo',
  birthDate: '1994-02-10',
  waistCm: 84,
  hasDiabetes: false,
  hasHypertension: false,
  hasDyslipidemia: false,
  trainingWindow: 'none' as const,
  usesDairyInSnacks: true,
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
  it('rejects legacy goalDeltaKg field', () => {
    expect(() =>
      patientProfileSchema.parse({
        ...basePayload,
        goal: 'lose_fat',
        goalDeltaKg: 6,
      }),
    ).toThrow();
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

  it('keeps backward compatibility by defaulting new clinical fields', () => {
    const parsed = patientProfileSchema.parse({
      goal: 'maintain',
      sex: 'female',
      age: 32,
      weightKg: 68,
      heightCm: 166,
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
    });

    expect(parsed.fullName).toBe('');
    expect(parsed.birthDate).toBeNull();
    expect(parsed.waistCm).toBeNull();
    expect(parsed.trainingWindow).toBe('none');
    expect(parsed.usesDairyInSnacks).toBe(true);
  });
});
