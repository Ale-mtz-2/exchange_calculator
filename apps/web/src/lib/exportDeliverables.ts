import type {
  EnergyTargets,
  EquivalentBucketPlanV2,
  PatientProfile,
  RankedFoodItemV2,
} from '@equivalentes/shared';

export type MacroTotals = {
  choG: number;
  proG: number;
  fatG: number;
  kcal: number;
};

const goalLabelMap: Record<PatientProfile['goal'], string> = {
  maintain: 'Mantener',
  lose_fat: 'Perder grasa',
  gain_muscle: 'Ganar musculo',
};

const sexLabelMap: Record<PatientProfile['sex'], string> = {
  female: 'Femenino',
  male: 'Masculino',
};

const activityLabelMap: Record<PatientProfile['activityLevel'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const dietPatternLabelMap: Record<PatientProfile['dietPattern'], string> = {
  omnivore: 'Omnivoro',
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  pescatarian: 'Pescetariano',
};

const budgetLabelMap: Record<PatientProfile['budgetLevel'], string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
};

const prepTimeLabelMap: Record<PatientProfile['prepTimeLevel'], string> = {
  short: 'Corto',
  medium: 'Medio',
  long: 'Largo',
};

const pad = (value: number): string => String(value).padStart(2, '0');

const sanitizeValue = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

const listToText = (items: string[]): string =>
  items.length > 0 ? items.map((item) => sanitizeValue(item)).join(' | ') : 'Sin datos';

const safeCid = (cid: string): string =>
  cid
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 64);

export const formatTimestampTag = (date: Date): string =>
  [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');

export const formatGeneratedAtLabel = (date: Date): string =>
  [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' ');

export const buildDeliverableFilename = (
  prefix: string,
  cid: string,
  generatedAt: Date,
  extension: 'csv' | 'pdf' | 'xlsx',
): string => `${prefix}_${safeCid(cid)}_${formatTimestampTag(generatedAt)}.${extension}`;

const macroPercent = (valueG: number, totalKcal: number, factor: number): number => {
  if (totalKcal <= 0) return 0;
  return Math.round(((valueG * factor) / totalKcal) * 1000) / 10;
};

type SummaryCsvParams = {
  cid: string;
  generatedAt: Date;
  profile: PatientProfile;
  targets: EnergyTargets;
  adjustedMacroTotals: MacroTotals;
};

export const buildSummaryCsvRows = ({
  cid,
  generatedAt,
  profile,
  targets,
  adjustedMacroTotals,
}: SummaryCsvParams): Record<string, string | number>[] => [
  {
    cid: safeCid(cid),
    generado_en: formatGeneratedAtLabel(generatedAt),
    nombre_completo: sanitizeValue(profile.fullName || '-'),
    fecha_nacimiento: profile.birthDate ?? '-',
    cintura_cm: profile.waistCm ?? '-',
    diabetes: profile.hasDiabetes ? 'si' : 'no',
    hipertension: profile.hasHypertension ? 'si' : 'no',
    dislipidemia: profile.hasDyslipidemia ? 'si' : 'no',
    ventana_entrenamiento: profile.trainingWindow,
    lacteos_en_colacion: profile.usesDairyInSnacks ? 'si' : 'no',
    objetivo: goalLabelMap[profile.goal],
    meta_kg_semana: profile.goalDeltaKgPerWeek,
    sexo: sexLabelMap[profile.sex],
    edad_anios: profile.age,
    peso_kg: profile.weightKg,
    estatura_cm: profile.heightCm,
    actividad: activityLabelMap[profile.activityLevel],
    comidas_dia: profile.mealsPerDay,
    pais: profile.countryCode,
    estado_provincia: profile.stateCode,
    sistema_equivalentes: profile.systemId,
    formula_kcal: profile.formulaId,
    patron_alimentario: dietPatternLabelMap[profile.dietPattern],
    presupuesto: budgetLabelMap[profile.budgetLevel],
    tiempo_preparacion: prepTimeLabelMap[profile.prepTimeLevel],
    alergias: listToText(profile.allergies),
    intolerancias: listToText(profile.intolerances),
    gustos: listToText(profile.likes),
    no_gustos: listToText(profile.dislikes),
    bmr_kcal: targets.bmr,
    tdee_kcal: targets.tdee,
    kcal_objetivo: adjustedMacroTotals.kcal,
    kcal_objetivo_referencia: targets.targetCalories,
    cho_g: adjustedMacroTotals.choG,
    pro_g: adjustedMacroTotals.proG,
    fat_g: adjustedMacroTotals.fatG,
    cho_pct: macroPercent(adjustedMacroTotals.choG, adjustedMacroTotals.kcal, 4),
    pro_pct: macroPercent(adjustedMacroTotals.proG, adjustedMacroTotals.kcal, 4),
    fat_pct: macroPercent(adjustedMacroTotals.fatG, adjustedMacroTotals.kcal, 9),
  },
];

type EquivalentsCsvParams = {
  bucketPlan: EquivalentBucketPlanV2[];
  resolveBucketLabel?: (bucket: EquivalentBucketPlanV2) => string;
};

export const buildEquivalentsCsvRows = ({
  bucketPlan,
  resolveBucketLabel,
}: EquivalentsCsvParams): Record<string, string | number>[] =>
  bucketPlan.map((bucket) => ({
    grupo: resolveBucketLabel ? resolveBucketLabel(bucket) : bucket.bucketName,
    codigo_grupo: bucket.bucketKey,
    equivalentes_dia: bucket.exchangesPerDay,
    cho_g: bucket.choG,
    pro_g: bucket.proG,
    fat_g: bucket.fatG,
    kcal: bucket.kcal,
  }));

type FoodsCsvParams = {
  foods: RankedFoodItemV2[];
  resolveFoodBucketLabel?: (food: RankedFoodItemV2) => string;
};

export const buildFoodsCsvRows = ({
  foods,
  resolveFoodBucketLabel,
}: FoodsCsvParams): Record<string, string | number>[] =>
  foods.map((food) => ({
    alimento: sanitizeValue(food.name),
    grupo: resolveFoodBucketLabel ? resolveFoodBucketLabel(food) : String(food.bucketKey),
    score: food.score,
    kcal: food.caloriesKcal,
    proteina_g: food.proteinG,
    carbohidrato_g: food.carbsG,
    grasa_g: food.fatG,
    porcion: `${food.servingQty} ${sanitizeValue(food.servingUnit)}`,
    razones: (food.reasons ?? [])
      .slice(0, 3)
      .map((reason) => sanitizeValue(reason.label))
      .join(' | '),
  }));
