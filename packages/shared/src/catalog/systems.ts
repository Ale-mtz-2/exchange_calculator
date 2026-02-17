import type { CountryCode } from './geography';

export type ExchangeSystemId = 'mx_smae' | 'us_usda' | 'es_exchange' | 'ar_exchange';

export type KcalFormulaId = 'mifflin_st_jeor' | 'harris_benedict_rev' | 'schofield';

export type Goal = 'maintain' | 'lose_fat' | 'gain_muscle';

export type Sex = 'male' | 'female';

export type ActivityLevel = 'low' | 'medium' | 'high';

export type DietPattern = 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian';

export type BudgetLevel = 'low' | 'medium' | 'high';

export type PrepTimeLevel = 'short' | 'medium' | 'long';

export type ExchangeGroupCode = 'vegetable' | 'fruit' | 'carb' | 'protein' | 'legume' | 'fat' | 'milk' | 'sugar';

export type ExchangeSubgroupCode =
  | 'aoa_muy_bajo_grasa'
  | 'aoa_bajo_grasa'
  | 'aoa_moderado_grasa'
  | 'aoa_alto_grasa'
  | 'cereal_sin_grasa'
  | 'cereal_con_grasa'
  | 'leche_descremada'
  | 'leche_semidescremada'
  | 'leche_entera'
  | 'leche_con_azucar'
  | 'azucar_sin_grasa'
  | 'azucar_con_grasa'
  | 'grasa_sin_proteina'
  | 'grasa_con_proteina';

export type ExchangeBucketCode = ExchangeGroupCode | ExchangeSubgroupCode;

export type SubgroupSelectionPolicyDefinition = {
  systemId: ExchangeSystemId;
  goal: Goal;
  dietPattern: DietPattern | 'any';
  subgroupCode: ExchangeSubgroupCode;
  targetSharePct: number;
  scoreAdjustment: number;
};

export type KcalSelectionPolicyDefinition = {
  systemId: ExchangeSystemId;
  lowTargetKcal: number;
  highTargetKcal: number;
  minTolerancePct: number;
  maxTolerancePct: number;
  minToleranceKcal: number;
  softPenaltyPer10Pct: number;
  hardOutlierMultiplier: number;
  excludeHardOutliers: boolean;
};

export type ExchangeSystemDefinition = {
  id: ExchangeSystemId;
  countryCode: CountryCode;
  name: string;
  source: string;
  isActive: boolean;
};

export const KCAL_FORMULAS = [
  {
    id: 'mifflin_st_jeor',
    name: 'Mifflin-St Jeor',
    description: 'Formula de uso clinico general para estimar BMR',
    sortOrder: 1,
  },
  {
    id: 'harris_benedict_rev',
    name: 'Harris-Benedict revisada',
    description: 'Revision de Roza y Shizgal para estimacion de BMR',
    sortOrder: 2,
  },
  {
    id: 'schofield',
    name: 'Schofield',
    description: 'Formula basada en peso y grupo etario',
    sortOrder: 3,
  },
] as const;

export const EXCHANGE_SYSTEMS: ExchangeSystemDefinition[] = [
  {
    id: 'mx_smae',
    countryCode: 'MX',
    name: 'Sistema Mexicano de Alimentos Equivalentes (SMAE)',
    source: 'nutrition.exchange_systems',
    isActive: true,
  },
  {
    id: 'us_usda',
    countryCode: 'US',
    name: 'USDA Exchanges (normalizado)',
    source: 'nutrition.exchange_systems',
    isActive: true,
  },
  {
    id: 'es_exchange',
    countryCode: 'ES',
    name: 'Sistema de intercambios Espana (normalizado)',
    source: 'equivalentes_app',
    isActive: true,
  },
  {
    id: 'ar_exchange',
    countryCode: 'AR',
    name: 'Sistema de intercambios Argentina (normalizado)',
    source: 'equivalentes_app',
    isActive: true,
  },
];

export const DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM: Partial<
  Record<ExchangeSystemId, SubgroupSelectionPolicyDefinition[]>
> = {
  mx_smae: [
    // --- AOA policies ---
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'aoa_muy_bajo_grasa', targetSharePct: 50, scoreAdjustment: 12 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'aoa_bajo_grasa', targetSharePct: 35, scoreAdjustment: 8 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'aoa_moderado_grasa', targetSharePct: 12, scoreAdjustment: -6 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'aoa_alto_grasa', targetSharePct: 3, scoreAdjustment: -12 },

    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'aoa_muy_bajo_grasa', targetSharePct: 30, scoreAdjustment: 6 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'aoa_bajo_grasa', targetSharePct: 40, scoreAdjustment: 8 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'aoa_moderado_grasa', targetSharePct: 25, scoreAdjustment: 2 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'aoa_alto_grasa', targetSharePct: 5, scoreAdjustment: -6 },

    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'aoa_muy_bajo_grasa', targetSharePct: 20, scoreAdjustment: 4 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'aoa_bajo_grasa', targetSharePct: 35, scoreAdjustment: 8 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'aoa_moderado_grasa', targetSharePct: 35, scoreAdjustment: 6 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'aoa_alto_grasa', targetSharePct: 10, scoreAdjustment: -2 },

    // --- Cereales policies ---
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'cereal_sin_grasa', targetSharePct: 85, scoreAdjustment: 10 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'cereal_con_grasa', targetSharePct: 15, scoreAdjustment: -8 },

    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'cereal_sin_grasa', targetSharePct: 70, scoreAdjustment: 4 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'cereal_con_grasa', targetSharePct: 30, scoreAdjustment: 0 },

    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'cereal_sin_grasa', targetSharePct: 60, scoreAdjustment: 2 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'cereal_con_grasa', targetSharePct: 40, scoreAdjustment: 2 },

    // --- Leche policies (winner-takes-most: 1-2 types per goal) ---
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'leche_descremada', targetSharePct: 100, scoreAdjustment: 10 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'leche_semidescremada', targetSharePct: 0, scoreAdjustment: -4 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'leche_entera', targetSharePct: 0, scoreAdjustment: -8 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'leche_con_azucar', targetSharePct: 0, scoreAdjustment: -12 },

    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'leche_descremada', targetSharePct: 0, scoreAdjustment: 2 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'leche_semidescremada', targetSharePct: 100, scoreAdjustment: 6 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'leche_entera', targetSharePct: 0, scoreAdjustment: 0 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'leche_con_azucar', targetSharePct: 0, scoreAdjustment: -6 },

    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'leche_descremada', targetSharePct: 0, scoreAdjustment: -2 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'leche_semidescremada', targetSharePct: 40, scoreAdjustment: 4 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'leche_entera', targetSharePct: 60, scoreAdjustment: 6 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'leche_con_azucar', targetSharePct: 0, scoreAdjustment: -2 },

    // --- Azucares policies (excluded for lose_fat at group level) ---
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'azucar_sin_grasa', targetSharePct: 0, scoreAdjustment: -8 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'azucar_con_grasa', targetSharePct: 0, scoreAdjustment: -12 },

    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'azucar_sin_grasa', targetSharePct: 100, scoreAdjustment: 2 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'azucar_con_grasa', targetSharePct: 0, scoreAdjustment: -4 },

    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'azucar_sin_grasa', targetSharePct: 70, scoreAdjustment: 0 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'azucar_con_grasa', targetSharePct: 30, scoreAdjustment: 2 },

    // --- Grasas policies (winner-takes-most per goal) ---
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'grasa_sin_proteina', targetSharePct: 100, scoreAdjustment: 6 },
    { systemId: 'mx_smae', goal: 'lose_fat', dietPattern: 'any', subgroupCode: 'grasa_con_proteina', targetSharePct: 0, scoreAdjustment: -4 },

    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'grasa_sin_proteina', targetSharePct: 60, scoreAdjustment: 2 },
    { systemId: 'mx_smae', goal: 'maintain', dietPattern: 'any', subgroupCode: 'grasa_con_proteina', targetSharePct: 40, scoreAdjustment: 2 },

    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'grasa_sin_proteina', targetSharePct: 30, scoreAdjustment: 0 },
    { systemId: 'mx_smae', goal: 'gain_muscle', dietPattern: 'any', subgroupCode: 'grasa_con_proteina', targetSharePct: 70, scoreAdjustment: 4 },
  ],
};

export const DEFAULT_KCAL_SELECTION_POLICIES_BY_SYSTEM: Record<
  ExchangeSystemId,
  KcalSelectionPolicyDefinition
> = {
  mx_smae: {
    systemId: 'mx_smae',
    lowTargetKcal: 1600,
    highTargetKcal: 3000,
    minTolerancePct: 0.2,
    maxTolerancePct: 0.6,
    minToleranceKcal: 25,
    softPenaltyPer10Pct: 2.5,
    hardOutlierMultiplier: 2.8,
    excludeHardOutliers: true,
  },
  us_usda: {
    systemId: 'us_usda',
    lowTargetKcal: 1600,
    highTargetKcal: 3000,
    minTolerancePct: 0.2,
    maxTolerancePct: 0.6,
    minToleranceKcal: 25,
    softPenaltyPer10Pct: 2.5,
    hardOutlierMultiplier: 2.8,
    excludeHardOutliers: true,
  },
  es_exchange: {
    systemId: 'es_exchange',
    lowTargetKcal: 1600,
    highTargetKcal: 3000,
    minTolerancePct: 0.2,
    maxTolerancePct: 0.6,
    minToleranceKcal: 25,
    softPenaltyPer10Pct: 2.5,
    hardOutlierMultiplier: 2.8,
    excludeHardOutliers: true,
  },
  ar_exchange: {
    systemId: 'ar_exchange',
    lowTargetKcal: 1600,
    highTargetKcal: 3000,
    minTolerancePct: 0.2,
    maxTolerancePct: 0.6,
    minToleranceKcal: 25,
    softPenaltyPer10Pct: 2.5,
    hardOutlierMultiplier: 2.8,
    excludeHardOutliers: true,
  },
};

