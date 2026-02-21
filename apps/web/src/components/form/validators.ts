import type { PatientProfile } from '@equivalentes/shared';

export type WeeklyGoalSetting = {
  min: number;
  max: number;
  recommended: number;
};

export const WEEKLY_GOAL_SETTINGS: Record<PatientProfile['goal'], WeeklyGoalSetting> = {
  maintain: { min: 0, max: 0, recommended: 0 },
  lose_fat: { min: 0.25, max: 0.75, recommended: 0.5 },
  gain_muscle: { min: 0.1, max: 0.4, recommended: 0.25 },
};

export type StepFieldErrors = Record<string, string>;

export type StepValidationResult = {
  valid: boolean;
  fieldErrors: StepFieldErrors;
  summary: string | null;
};

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const round = (value: number, digits = 2): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const toValidationResult = (fieldErrors: StepFieldErrors): StepValidationResult => {
  const messages = Object.values(fieldErrors);
  if (messages.length === 0) {
    return { valid: true, fieldErrors, summary: null };
  }

  return {
    valid: false,
    fieldErrors,
    summary: `Revisa el paso actual: ${messages[0]}`,
  };
};

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const inRange = (value: number, minValue: number, maxValue: number): boolean =>
  value >= minValue && value <= maxValue;

const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);
const MIN_AGE = 15;
const MAX_AGE = 90;
const MIN_WAIST_CM = 40;
const MAX_WAIST_CM = 250;

export const deriveAgeFromBirthDate = (
  birthDateIso: string,
  nowDate: Date = new Date(),
): number | null => {
  if (!isIsoDate(birthDateIso)) return null;
  const [yearText, monthText, dayText] = birthDateIso.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const birthDate = new Date(`${birthDateIso}T00:00:00.000Z`);
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() + 1 !== month ||
    birthDate.getUTCDate() !== day
  ) {
    return null;
  }

  const nowYear = nowDate.getUTCFullYear();
  const nowMonth = nowDate.getUTCMonth() + 1;
  const nowDay = nowDate.getUTCDate();
  let age = nowYear - year;

  if (nowMonth < month || (nowMonth === month && nowDay < day)) {
    age -= 1;
  }

  return age;
};

export const clampWeeklyGoalDelta = (
  goal: PatientProfile['goal'],
  value: number,
): number => {
  const settings = WEEKLY_GOAL_SETTINGS[goal];
  if (goal === 'maintain') return 0;
  return round(clamp(value, settings.min, settings.max), 2);
};

export const validateGoalStep = (profile: PatientProfile): StepValidationResult => {
  const errors: StepFieldErrors = {};

  if (!profile.fullName.trim()) {
    errors.fullName = 'Ingresa nombre completo para personalizar el plan.';
  }

  if (!profile.goal) {
    errors.goal = 'Selecciona un objetivo.';
  }

  if (!profile.formulaId) {
    errors.formulaId = 'Selecciona una formula kcal.';
  }

  if (!isFiniteNumber(profile.goalDeltaKgPerWeek)) {
    errors.goalDeltaKgPerWeek = 'La meta semanal debe ser numerica.';
  } else if (profile.goal === 'maintain') {
    if (profile.goalDeltaKgPerWeek !== 0) {
      errors.goalDeltaKgPerWeek = 'Para mantener, la meta semanal debe ser 0.00 kg/semana.';
    }
  } else {
    const settings = WEEKLY_GOAL_SETTINGS[profile.goal];
    if (!inRange(profile.goalDeltaKgPerWeek, settings.min, settings.max)) {
      errors.goalDeltaKgPerWeek = `La meta semanal debe estar entre ${settings.min.toFixed(2)} y ${settings.max.toFixed(2)} kg/semana.`;
    }
  }

  return toValidationResult(errors);
};

export const validateAnthropometryStep = (
  profile: PatientProfile,
): StepValidationResult => {
  const errors: StepFieldErrors = {};

  if (!profile.sex) {
    errors.sex = 'Selecciona el sexo.';
  }

  if (!isFiniteNumber(profile.weightKg) || !inRange(profile.weightKg, 35, 350)) {
    errors.weightKg = 'El peso debe estar entre 35 y 350 kg.';
  }

  if (!isFiniteNumber(profile.heightCm) || !inRange(profile.heightCm, 120, 230)) {
    errors.heightCm = 'La estatura debe estar entre 120 y 230 cm.';
  }

  if (!profile.activityLevel) {
    errors.activityLevel = 'Selecciona el nivel de actividad.';
  }

  if (![3, 4, 5].includes(profile.mealsPerDay)) {
    errors.mealsPerDay = 'Comidas por dia validas: 3, 4 o 5.';
  }

  if (
    profile.waistCm !== null &&
    (!isFiniteNumber(profile.waistCm) || !inRange(profile.waistCm, MIN_WAIST_CM, MAX_WAIST_CM))
  ) {
    errors.waistCm = 'La cintura debe estar entre 40 y 250 cm.';
  }

  return toValidationResult(errors);
};

export const validateRegionStep = (
  profile: PatientProfile,
  validStateCodes: string[],
  validSystemIds: string[],
): StepValidationResult => {
  const errors: StepFieldErrors = {};

  if (!profile.countryCode) {
    errors.countryCode = 'Selecciona un pais.';
  }

  if (!profile.stateCode) {
    errors.stateCode = 'Selecciona un estado o provincia.';
  } else if (!validStateCodes.includes(profile.stateCode)) {
    errors.stateCode = 'El estado o provincia no corresponde al pais seleccionado.';
  }

  if (!profile.systemId) {
    errors.systemId = 'Selecciona un sistema de equivalentes.';
  } else if (!validSystemIds.includes(profile.systemId)) {
    errors.systemId = 'El sistema seleccionado no es compatible con el pais.';
  }

  return toValidationResult(errors);
};

export const validateHabitsStep = (profile: PatientProfile): StepValidationResult => {
  const errors: StepFieldErrors = {};

  if (!profile.dietPattern) {
    errors.dietPattern = 'Selecciona un patron alimentario.';
  }

  if (!profile.budgetLevel) {
    errors.budgetLevel = 'Selecciona un nivel de presupuesto.';
  }

  if (!profile.prepTimeLevel) {
    errors.prepTimeLevel = 'Selecciona un tiempo de preparacion.';
  }

  return toValidationResult(errors);
};

export const validateClinicalStep = (profile: PatientProfile): StepValidationResult => {
  const errors: StepFieldErrors = {};

  if (!profile.birthDate) {
    errors.birthDate = 'Ingresa la fecha de nacimiento.';
    return toValidationResult(errors);
  }

  if (!isIsoDate(profile.birthDate)) {
    errors.birthDate = 'La fecha debe tener formato YYYY-MM-DD.';
    return toValidationResult(errors);
  }

  const age = deriveAgeFromBirthDate(profile.birthDate);
  if (age === null) {
    errors.birthDate = 'Ingresa una fecha de nacimiento valida.';
  } else if (!inRange(age, MIN_AGE, MAX_AGE)) {
    errors.birthDate = `La edad calculada debe estar entre ${MIN_AGE} y ${MAX_AGE} anios.`;
  }

  return toValidationResult(errors);
};

export const validateReviewStep = (): StepValidationResult =>
  toValidationResult({});

export const getFirstInvalidStepIndex = (
  validations: StepValidationResult[],
): number => validations.findIndex((item) => !item.valid);
