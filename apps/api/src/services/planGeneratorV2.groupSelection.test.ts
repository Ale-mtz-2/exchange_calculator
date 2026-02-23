import type { EnergyTargets, PatientProfile } from '@equivalentes/shared';
import { describe, expect, it } from 'vitest';

import { __testables } from './planGeneratorV2.js';

const baseProfile = (): PatientProfile => ({
  fullName: 'Paciente Demo',
  birthDate: '1994-02-22',
  waistCm: 90,
  hasDiabetes: false,
  hasHypertension: false,
  hasDyslipidemia: false,
  trainingWindow: 'none',
  usesDairyInSnacks: true,
  planningFocus: 'clinical',
  goal: 'lose_fat',
  goalDeltaKgPerWeek: 0.5,
  sex: 'male',
  age: 32,
  weightKg: 95,
  heightCm: 180,
  activityLevel: 'medium',
  mealsPerDay: 3,
  countryCode: 'MX',
  stateCode: 'DUR',
  systemId: 'mx_smae',
  formulaId: 'mifflin_st_jeor',
  dietPattern: 'omnivore',
  allergies: [],
  intolerances: [],
  likes: [],
  dislikes: [],
  budgetLevel: 'high',
  prepTimeLevel: 'medium',
});

const targets: EnergyTargets = {
  bmr: 0,
  tdee: 0,
  targetCalories: 0,
  carbsG: 50,
  proteinG: 60,
  fatG: 10,
};

const groupProfiles = [
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 1,
    parentGroupId: null,
    choG: 4,
    proG: 1,
    fatG: 0,
    kcal: 20,
    sampleSize: 50,
    bucketName: 'Verduras',
    legacyCode: 'vegetable',
    familyCode: 'vegetable',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 2,
    parentGroupId: null,
    choG: 15,
    proG: 1,
    fatG: 0,
    kcal: 60,
    sampleSize: 50,
    bucketName: 'Frutas',
    legacyCode: 'fruit',
    familyCode: 'fruit',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 3,
    parentGroupId: null,
    choG: 8,
    proG: 8,
    fatG: 2,
    kcal: 80,
    sampleSize: 50,
    bucketName: 'Leguminosas',
    legacyCode: 'legume',
    familyCode: 'legume',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 4,
    parentGroupId: null,
    choG: 0,
    proG: 10,
    fatG: 2,
    kcal: 60,
    sampleSize: 50,
    bucketName: 'AOA',
    legacyCode: 'protein',
    familyCode: 'protein',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 5,
    parentGroupId: null,
    choG: 12,
    proG: 8,
    fatG: 5,
    kcal: 120,
    sampleSize: 50,
    bucketName: 'Leche',
    legacyCode: 'milk',
    familyCode: 'milk',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 6,
    parentGroupId: null,
    choG: 10,
    proG: 0,
    fatG: 0,
    kcal: 40,
    sampleSize: 50,
    bucketName: 'Azucares',
    legacyCode: 'sugar',
    familyCode: 'sugar',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 7,
    parentGroupId: null,
    choG: 0,
    proG: 0,
    fatG: 5,
    kcal: 45,
    sampleSize: 50,
    bucketName: 'Grasas',
    legacyCode: 'fat',
    familyCode: 'fat',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'group',
    bucketId: 8,
    parentGroupId: null,
    choG: 15,
    proG: 2,
    fatG: 1,
    kcal: 70,
    sampleSize: 50,
    bucketName: 'Cereales',
    legacyCode: 'carb',
    familyCode: 'carb',
  },
];

const subgroupProfiles = [
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'subgroup',
    bucketId: 701,
    parentGroupId: 7,
    choG: 0,
    proG: 0,
    fatG: 5,
    kcal: 45,
    sampleSize: 100,
    bucketName: 'Grasas sin Proteina',
    legacyCode: 'grasa_sin_proteina',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'subgroup',
    bucketId: 702,
    parentGroupId: 7,
    choG: 0,
    proG: 1,
    fatG: 4,
    kcal: 45,
    sampleSize: 100,
    bucketName: 'Grasas con Proteina',
    legacyCode: 'grasa_con_proteina',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'subgroup',
    bucketId: 801,
    parentGroupId: 6,
    choG: 10,
    proG: 0,
    fatG: 0,
    kcal: 40,
    sampleSize: 100,
    bucketName: 'Azucares sin Grasa',
    legacyCode: 'azucar_sin_grasa',
  },
  {
    profileVersion: 'test',
    systemId: 'mx_smae',
    bucketType: 'subgroup',
    bucketId: 802,
    parentGroupId: 6,
    choG: 8,
    proG: 0,
    fatG: 2,
    kcal: 40,
    sampleSize: 100,
    bucketName: 'Azucares con Grasa',
    legacyCode: 'azucar_con_grasa',
  },
];

const subgroupPolicies = [
  { subgroupId: 701, targetSharePct: 100, scoreAdjustment: 0 },
  { subgroupId: 702, targetSharePct: 0, scoreAdjustment: 0 },
  { subgroupId: 801, targetSharePct: 0, scoreAdjustment: 0 },
  { subgroupId: 802, targetSharePct: 100, scoreAdjustment: 0 },
];

const getBucketExchanges = (
  bucketPlan: Array<{ legacyCode?: string; exchangesPerDay: number }>,
  legacyCode: string,
): number => bucketPlan.find((bucket) => bucket.legacyCode === legacyCode)?.exchangesPerDay ?? 0;

describe('planGeneratorV2 group selection floors and subgroup overrides', () => {
  it('applies sugar/fat minimums and subgroup overrides for lose_fat + explicit sweet preference', () => {
    const profile = {
      ...baseProfile(),
      likes: ['nieve'],
    };

    const groupPlan = __testables.buildGroupPlan(targets, groupProfiles as any, profile);
    expect(getBucketExchanges(groupPlan, 'sugar')).toBeGreaterThanOrEqual(0.5);
    expect(getBucketExchanges(groupPlan, 'fat')).toBeGreaterThanOrEqual(1);

    const subgroupPlan = __testables.buildSubgroupPlan(
      groupPlan,
      subgroupProfiles as any,
      subgroupPolicies,
      profile,
    );

    expect(getBucketExchanges(subgroupPlan, 'azucar_sin_grasa')).toBeGreaterThanOrEqual(0.5);
    expect(getBucketExchanges(subgroupPlan, 'azucar_con_grasa')).toBe(0);
    expect(getBucketExchanges(subgroupPlan, 'grasa_con_proteina')).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps sugar at zero for diabetes even with sweet preference', () => {
    const profile = {
      ...baseProfile(),
      hasDiabetes: true,
      likes: ['nieve'],
    };

    const groupPlan = __testables.buildGroupPlan(targets, groupProfiles as any, profile);
    expect(getBucketExchanges(groupPlan, 'sugar')).toBe(0);
  });

  it('does not force fat minimum when dyslipidemia is present', () => {
    const profile = {
      ...baseProfile(),
      hasDyslipidemia: true,
    };

    const groupPlan = __testables.buildGroupPlan(targets, groupProfiles as any, profile);
    expect(getBucketExchanges(groupPlan, 'fat')).toBeLessThan(1);
  });

  it('keeps sugar at zero in lose_fat when no explicit sweet preference exists', () => {
    const profile = {
      ...baseProfile(),
      likes: [],
    };

    const groupPlan = __testables.buildGroupPlan(targets, groupProfiles as any, profile);
    expect(getBucketExchanges(groupPlan, 'sugar')).toBe(0);
  });
});
