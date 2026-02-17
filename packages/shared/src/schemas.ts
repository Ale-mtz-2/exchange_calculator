import { z } from 'zod';

export const eventTypeSchema = z.enum(['open', 'generate', 'export']);
export const trackingSourceSchema = z.enum(['whatsapp', 'guest']);
export const trackingIdentityModeSchema = z.enum(['query_cid', 'guest_localstorage']);

export const countryCodeSchema = z.enum(['MX', 'US', 'ES', 'AR']);

export const exchangeSystemIdSchema = z.enum(['mx_smae', 'us_usda', 'es_exchange', 'ar_exchange']);

export const kcalFormulaIdSchema = z.enum([
  'mifflin_st_jeor',
  'harris_benedict_rev',
  'schofield',
]);

export const goalSchema = z.enum(['maintain', 'lose_fat', 'gain_muscle']);

const WEEKLY_HEALTHY_RANGES = {
  lose_fat: { min: 0.25, max: 0.75 },
  gain_muscle: { min: 0.1, max: 0.4 },
} as const;

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const round = (value: number, digits = 2): number => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};

const normalizeWeeklyGoalDelta = (
  goal: 'maintain' | 'lose_fat' | 'gain_muscle',
  weeklyRaw?: number,
): number => {
  if (goal === 'maintain') return 0;

  const weeklyCandidate =
    typeof weeklyRaw === 'number'
      ? weeklyRaw
      : goal === 'lose_fat'
        ? 0.5
        : 0.25;

  const weeklyBase = clamp(weeklyCandidate, 0, 1);

  if (goal === 'lose_fat') {
    return round(clamp(weeklyBase, WEEKLY_HEALTHY_RANGES.lose_fat.min, WEEKLY_HEALTHY_RANGES.lose_fat.max));
  }

  return round(clamp(weeklyBase, WEEKLY_HEALTHY_RANGES.gain_muscle.min, WEEKLY_HEALTHY_RANGES.gain_muscle.max));
};

const rawPatientProfileSchema = z.object({
  goal: goalSchema,
  goalDeltaKgPerWeek: z.number().min(0).max(1).optional(),
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(15).max(90),
  weightKg: z.number().min(35).max(350),
  heightCm: z.number().min(120).max(230),
  activityLevel: z.enum(['low', 'medium', 'high']),
  mealsPerDay: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  countryCode: countryCodeSchema,
  stateCode: z.string().min(1).max(10),
  systemId: exchangeSystemIdSchema,
  formulaId: kcalFormulaIdSchema,
  dietPattern: z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian']),
  allergies: z.array(z.string().min(1)).default([]),
  intolerances: z.array(z.string().min(1)).default([]),
  likes: z.array(z.string().min(1)).default([]),
  dislikes: z.array(z.string().min(1)).default([]),
  budgetLevel: z.enum(['low', 'medium', 'high']),
  prepTimeLevel: z.enum(['short', 'medium', 'long']),
}).strict();

export const patientProfileSchema = rawPatientProfileSchema.transform((profile) => ({
  goal: profile.goal,
  goalDeltaKgPerWeek: normalizeWeeklyGoalDelta(
    profile.goal,
    profile.goalDeltaKgPerWeek,
  ),
  sex: profile.sex,
  age: profile.age,
  weightKg: profile.weightKg,
  heightCm: profile.heightCm,
  activityLevel: profile.activityLevel,
  mealsPerDay: profile.mealsPerDay,
  countryCode: profile.countryCode,
  stateCode: profile.stateCode,
  systemId: profile.systemId,
  formulaId: profile.formulaId,
  dietPattern: profile.dietPattern,
  allergies: profile.allergies,
  intolerances: profile.intolerances,
  likes: profile.likes,
  dislikes: profile.dislikes,
  budgetLevel: profile.budgetLevel,
  prepTimeLevel: profile.prepTimeLevel,
}));

export const createEventSchema = z.object({
  cid: z.string().min(1).max(200),
  event: eventTypeSchema,
  meta: z.record(z.unknown()).optional(),
});

export const generatePlanSchema = z.object({
  cid: z.string().min(1).max(200),
  profile: patientProfileSchema,
});

export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(200).optional(),
  source: z.enum(['all', 'whatsapp', 'guest']).default('all'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type GeneratePlanInput = z.infer<typeof generatePlanSchema>;
