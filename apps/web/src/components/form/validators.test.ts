import { describe, expect, it } from 'vitest';

import type { PatientProfile } from '@equivalentes/shared';

import {
  clampWeeklyGoalDelta,
  deriveAgeFromBirthDate,
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
  planningFocus: 'clinical',
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

  it('requires full name in goal step', () => {
    const result = validateGoalStep({ ...baseProfile(), fullName: '  ' });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.fullName).toBeTruthy();
  });

  it('validates anthropometric limits', () => {
    const profile = {
      ...baseProfile(),
      waistCm: 300,
      weightKg: 500,
      heightCm: 100,
    };
    const result = validateAnthropometryStep(profile);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.waistCm).toBeTruthy();
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
      { valid: false, fieldErrors: { birthDate: 'bad' }, summary: 'bad' },
      { valid: true, fieldErrors: {}, summary: null },
    ];
    expect(getFirstInvalidStepIndex(validations)).toBe(1);
  });

  it('requires birth date in clinical step', () => {
    const result = validateClinicalStep({ ...baseProfile(), birthDate: null });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.birthDate).toBeTruthy();
  });

  it('validates derived age range in clinical step', () => {
    const tooYoung = validateClinicalStep({ ...baseProfile(), birthDate: '2014-03-01' });
    const tooOld = validateClinicalStep({ ...baseProfile(), birthDate: '1930-01-01' });

    expect(tooYoung.valid).toBe(false);
    expect(tooYoung.fieldErrors.birthDate).toContain('15 y 90');
    expect(tooOld.valid).toBe(false);
    expect(tooOld.fieldErrors.birthDate).toContain('15 y 90');
  });

  it('derives age from birth date for past and upcoming birthdays', () => {
    const now = new Date('2026-02-21T00:00:00.000Z');
    expect(deriveAgeFromBirthDate('1994-02-10', now)).toBe(32);
    expect(deriveAgeFromBirthDate('1994-09-10', now)).toBe(31);
  });

  it('returns null when birth date is invalid', () => {
    expect(deriveAgeFromBirthDate('1994-02-31')).toBeNull();
    expect(deriveAgeFromBirthDate('1994/02/10')).toBeNull();
    expect(deriveAgeFromBirthDate('')).toBeNull();
  });

  it('accepts lower and upper age boundaries', () => {
    const now = new Date('2026-02-21T00:00:00.000Z');
    expect(deriveAgeFromBirthDate('2011-02-21', now)).toBe(15);
    expect(deriveAgeFromBirthDate('1936-02-21', now)).toBe(90);
  });

  it('passes clinical step when birth date yields valid age', () => {
    const result = validateClinicalStep({ ...baseProfile(), birthDate: '1994-02-10' });
    expect(result.valid).toBe(true);
    expect(result.fieldErrors.birthDate).toBeUndefined();
  });
});
