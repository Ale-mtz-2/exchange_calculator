import type { ActivityLevel, KcalFormulaId, Sex } from '../catalog/systems';
import type { EnergyTargets, PatientProfile } from '../types';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  low: 1.375,
  medium: 1.55,
  high: 1.725,
};

const MACRO_RATIOS: Record<PatientProfile['goal'], { carbs: number; protein: number; fat: number }> = {
  maintain: { carbs: 0.45, protein: 0.25, fat: 0.3 },
  lose_fat: { carbs: 0.4, protein: 0.3, fat: 0.3 },
  gain_muscle: { carbs: 0.5, protein: 0.25, fat: 0.25 },
};

const WEEKLY_HEALTHY_RANGES = {
  lose_fat: { min: 0.25, max: 0.75 },
  gain_muscle: { min: 0.1, max: 0.4 },
} as const;

const KCAL_PER_KG = 7700;
const DAYS_PER_WEEK = 7;
const GAIN_CALORIE_CAP_FACTOR = 1.35;

const round = (value: number, digits = 0): number => {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const sexCalorieFloor = (sex: Sex): number => (sex === 'female' ? 1200 : 1500);

const normalizeWeeklyGoalDelta = (
  goal: PatientProfile['goal'],
  goalDeltaKgPerWeek: number,
): number => {
  if (!Number.isFinite(goalDeltaKgPerWeek) || goal === 'maintain') {
    return 0;
  }

  if (goal === 'lose_fat') {
    return clamp(
      goalDeltaKgPerWeek,
      WEEKLY_HEALTHY_RANGES.lose_fat.min,
      WEEKLY_HEALTHY_RANGES.lose_fat.max,
    );
  }

  return clamp(
    goalDeltaKgPerWeek,
    WEEKLY_HEALTHY_RANGES.gain_muscle.min,
    WEEKLY_HEALTHY_RANGES.gain_muscle.max,
  );
};

const resolveWeeklyDeltaCalories = (
  goal: PatientProfile['goal'],
  goalDeltaKgPerWeek: number,
): number => {
  const weeklyDelta = normalizeWeeklyGoalDelta(goal, goalDeltaKgPerWeek);
  return (weeklyDelta * KCAL_PER_KG) / DAYS_PER_WEEK;
};

const mifflinStJeor = (sex: Sex, weightKg: number, heightCm: number, age: number): number => {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
};

const harrisBenedictRevised = (
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number => {
  if (sex === 'male') {
    return 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age;
  }

  return 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
};

const schofield = (sex: Sex, weightKg: number, age: number): number => {
  if (sex === 'male') {
    if (age < 30) return 15.057 * weightKg + 692.2;
    if (age < 60) return 11.472 * weightKg + 873.1;
    return 11.711 * weightKg + 587.7;
  }

  if (age < 30) return 14.818 * weightKg + 486.6;
  if (age < 60) return 8.126 * weightKg + 845.6;
  return 9.082 * weightKg + 658.5;
};

export const calculateBmr = (
  formulaId: KcalFormulaId,
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
): number => {
  const normalizedFormula = formulaId.toLowerCase();

  switch (normalizedFormula) {
    case 'mifflin_st_jeor':
      return mifflinStJeor(sex, weightKg, heightCm, age);
    case 'harris_benedict_rev':
      return harrisBenedictRevised(sex, weightKg, heightCm, age);
    case 'schofield':
      return schofield(sex, weightKg, age);
    default:
      return mifflinStJeor(sex, weightKg, heightCm, age);
  }
};

export const calculateEnergyTargets = (profile: PatientProfile): EnergyTargets => {
  const bmr = calculateBmr(
    profile.formulaId,
    profile.sex,
    profile.weightKg,
    profile.heightCm,
    profile.age,
  );

  const tdee = bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const dailyDeltaKcal = resolveWeeklyDeltaCalories(profile.goal, profile.goalDeltaKgPerWeek);

  let rawTargetCalories = tdee;
  if (profile.goal === 'lose_fat') {
    rawTargetCalories = tdee - dailyDeltaKcal;
  } else if (profile.goal === 'gain_muscle') {
    rawTargetCalories = tdee + dailyDeltaKcal;
  }

  const minCalories = sexCalorieFloor(profile.sex);
  const maxCalories = profile.goal === 'gain_muscle' ? tdee * GAIN_CALORIE_CAP_FACTOR : Number.POSITIVE_INFINITY;
  const targetCalories = clamp(rawTargetCalories, minCalories, maxCalories);
  const ratio = MACRO_RATIOS[profile.goal];

  const carbsG = (targetCalories * ratio.carbs) / 4;
  const proteinG = (targetCalories * ratio.protein) / 4;
  const fatG = (targetCalories * ratio.fat) / 9;

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    targetCalories: round(targetCalories),
    carbsG: round(carbsG, 1),
    proteinG: round(proteinG, 1),
    fatG: round(fatG, 1),
  };
};
