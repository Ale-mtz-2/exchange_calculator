import { describe, expect, it } from 'vitest';

import { calculateEnergyTargets } from '../src/algorithms/formulas';
import type { PatientProfile } from '../src/types';

const baseProfile: PatientProfile = {
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

describe('calculateEnergyTargets', () => {
  it('calculates targets with Mifflin formula', () => {
    const result = calculateEnergyTargets(baseProfile);

    expect(result.bmr).toBeGreaterThan(1200);
    expect(result.targetCalories).toBeGreaterThan(1500);
    expect(result.carbsG).toBeGreaterThan(result.proteinG);
  });

  it('changes output by formula', () => {
    const harris = calculateEnergyTargets({ ...baseProfile, formulaId: 'harris_benedict_rev' });
    const schofield = calculateEnergyTargets({ ...baseProfile, formulaId: 'schofield' });

    expect(harris.targetCalories).not.toBe(schofield.targetCalories);
  });

  it('applies goal adjustment', () => {
    const maintain = calculateEnergyTargets({ ...baseProfile, goal: 'maintain', goalDeltaKgPerWeek: 0 });
    const lose = calculateEnergyTargets({ ...baseProfile, goal: 'lose_fat', goalDeltaKgPerWeek: 0.5 });
    const gain = calculateEnergyTargets({ ...baseProfile, goal: 'gain_muscle', goalDeltaKgPerWeek: 0.25 });

    expect(lose.targetCalories).toBeLessThan(maintain.targetCalories);
    expect(gain.targetCalories).toBeGreaterThan(maintain.targetCalories);
  });

  it('applies extra kcal shift when weekly delta is larger', () => {
    const loseSmall = calculateEnergyTargets({ ...baseProfile, goal: 'lose_fat', goalDeltaKgPerWeek: 0.3 });
    const loseLarge = calculateEnergyTargets({ ...baseProfile, goal: 'lose_fat', goalDeltaKgPerWeek: 0.7 });
    const gainSmall = calculateEnergyTargets({ ...baseProfile, goal: 'gain_muscle', goalDeltaKgPerWeek: 0.15 });
    const gainLarge = calculateEnergyTargets({ ...baseProfile, goal: 'gain_muscle', goalDeltaKgPerWeek: 0.35 });

    expect(loseLarge.targetCalories).toBeLessThan(loseSmall.targetCalories);
    expect(gainLarge.targetCalories).toBeGreaterThan(gainSmall.targetCalories);
  });

  it('enforces calorie floors and gain cap', () => {
    const aggressiveLoseFemale = calculateEnergyTargets({
      ...baseProfile,
      sex: 'female',
      goal: 'lose_fat',
      goalDeltaKgPerWeek: 0.75,
      weightKg: 42,
      heightCm: 152,
      age: 45,
      activityLevel: 'low',
    });

    const aggressiveLoseMale = calculateEnergyTargets({
      ...baseProfile,
      sex: 'male',
      goal: 'lose_fat',
      goalDeltaKgPerWeek: 0.75,
      weightKg: 55,
      heightCm: 165,
      age: 42,
      activityLevel: 'low',
    });

    const highGain = calculateEnergyTargets({
      ...baseProfile,
      sex: 'male',
      goal: 'gain_muscle',
      goalDeltaKgPerWeek: 0.4,
      weightKg: 110,
      heightCm: 190,
      age: 28,
      activityLevel: 'high',
    });

    expect(aggressiveLoseFemale.targetCalories).toBeGreaterThanOrEqual(1200);
    expect(aggressiveLoseMale.targetCalories).toBeGreaterThanOrEqual(1500);
    expect(highGain.targetCalories).toBeLessThanOrEqual(highGain.tdee * 1.35);
  });
});
