import { describe, expect, it } from 'vitest';

import type { PatientProfile } from '@equivalentes/shared';

import {
  clampWeeklyGoalDelta,
  validateClinicalStep,
  getFirstInvalidStepIndex,
  validateAnthropometryStep,
  validateGoalStep,
  validateRegionStep,
} from './validators';

const baseProfile = (): PatientProfile => ({
  fullName: 'Paciente Demo',
  birthDate: '1996-01-01',
  waistCm: 80,
  hasDiabetes: false,
  hasHypertension: false,
  hasDyslipidemia: false,
  trainingWindow: 'none',
  usesDairyInSnacks: true,
  goal: 'maintain',
  goalDeltaKgPerWeek: 0,
  sex: 'female',
  age: 30,
  weightKg: 65,
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
});

describe('validators', () => {
  it('clamps weekly goal delta by goal', () => {
    expect(clampWeeklyGoalDelta('maintain', 0.55)).toBe(0);
    expect(clampWeeklyGoalDelta('lose_fat', 0.9)).toBe(0.75);
    expect(clampWeeklyGoalDelta('gain_muscle', 0.05)).toBe(0.1);
  });

  it('validates goal step ranges', () => {
    const validLoseFat = {
      ...baseProfile(),
      goal: 'lose_fat' as const,
      goalDeltaKgPerWeek: 0.5,
    };
    expect(validateGoalStep(validLoseFat).valid).toBe(true);

    const invalidLoseFat = {
      ...baseProfile(),
      goal: 'lose_fat' as const,
      goalDeltaKgPerWeek: 0.05,
    };
    const result = validateGoalStep(invalidLoseFat);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.goalDeltaKgPerWeek).toContain('0.25');
  });

  it('validates anthropometric limits', () => {
    const profile = {
      ...baseProfile(),
      age: 10,
      weightKg: 500,
      heightCm: 100,
    };
    const result = validateAnthropometryStep(profile);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.age).toBeTruthy();
    expect(result.fieldErrors.weightKg).toBeTruthy();
    expect(result.fieldErrors.heightCm).toBeTruthy();
  });

  it('validates region compatibility', () => {
    const profile = {
      ...baseProfile(),
      stateCode: 'ZZZ',
      systemId: 'us_usda' as const,
    };
    const result = validateRegionStep(profile, ['CMX', 'AGU'], ['mx_smae']);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.stateCode).toBeTruthy();
    expect(result.fieldErrors.systemId).toBeTruthy();
  });

  it('finds first invalid step index', () => {
    const validations = [
      { valid: true, fieldErrors: {}, summary: null },
      { valid: false, fieldErrors: { age: 'bad' }, summary: 'bad' },
      { valid: true, fieldErrors: {}, summary: null },
    ];
    expect(getFirstInvalidStepIndex(validations)).toBe(1);
  });

  it('validates clinical step requirements for guest profile', () => {
    const missingName = { ...baseProfile(), fullName: '' };
    const result = validateClinicalStep(missingName, { requireFullName: true });

    expect(result.valid).toBe(false);
    expect(result.fieldErrors.fullName).toBeTruthy();
  });
});
