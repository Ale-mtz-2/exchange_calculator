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

export type ExchangeGroupDefinition = {
  id: number;
  systemId: ExchangeSystemId;
  groupCode: ExchangeGroupCode;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
  sortOrder: number;
};

export type ExchangeSubgroupDefinition = {
  id: number;
  systemId: ExchangeSystemId;
  parentGroupCode: ExchangeGroupCode;
  subgroupCode: ExchangeSubgroupCode;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
  sortOrder: number;
};

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

export const DEFAULT_GROUPS_BY_SYSTEM: Record<ExchangeSystemId, ExchangeGroupDefinition[]> = {
  mx_smae: [
    {
      id: 1,
      systemId: 'mx_smae',
      groupCode: 'vegetable',
      displayNameEs: 'Verduras',
      choG: 5,
      proG: 2,
      fatG: 0,
      kcalTarget: 25,
      sortOrder: 1,
    },
    {
      id: 2,
      systemId: 'mx_smae',
      groupCode: 'fruit',
      displayNameEs: 'Frutas',
      choG: 15,
      proG: 0,
      fatG: 0,
      kcalTarget: 60,
      sortOrder: 2,
    },
    {
      id: 3,
      systemId: 'mx_smae',
      groupCode: 'carb',
      displayNameEs: 'Cereales y tuberculos',
      choG: 15,
      proG: 2,
      fatG: 0,
      kcalTarget: 70,
      sortOrder: 3,
    },
    {
      id: 4,
      systemId: 'mx_smae',
      groupCode: 'legume',
      displayNameEs: 'Leguminosas',
      choG: 20,
      proG: 8,
      fatG: 1,
      kcalTarget: 120,
      sortOrder: 4,
    },
    {
      id: 5,
      systemId: 'mx_smae',
      groupCode: 'protein',
      displayNameEs: 'Alimentos de origen animal',
      choG: 0,
      proG: 7,
      fatG: 3,
      kcalTarget: 55,
      sortOrder: 5,
    },
    {
      id: 6,
      systemId: 'mx_smae',
      groupCode: 'milk',
      displayNameEs: 'Leche',
      choG: 12,
      proG: 9,
      fatG: 4,
      kcalTarget: 110,
      sortOrder: 6,
    },
    {
      id: 7,
      systemId: 'mx_smae',
      groupCode: 'fat',
      displayNameEs: 'Grasas',
      choG: 0,
      proG: 0,
      fatG: 5,
      kcalTarget: 45,
      sortOrder: 7,
    },
    {
      id: 8,
      systemId: 'mx_smae',
      groupCode: 'sugar',
      displayNameEs: 'Azucares',
      choG: 10,
      proG: 0,
      fatG: 0,
      kcalTarget: 40,
      sortOrder: 8,
    },
  ],
  us_usda: [
    {
      id: 101,
      systemId: 'us_usda',
      groupCode: 'vegetable',
      displayNameEs: 'Vegetables',
      choG: 5,
      proG: 2,
      fatG: 0,
      kcalTarget: 25,
      sortOrder: 1,
    },
    {
      id: 102,
      systemId: 'us_usda',
      groupCode: 'fruit',
      displayNameEs: 'Fruits',
      choG: 15,
      proG: 0,
      fatG: 0,
      kcalTarget: 60,
      sortOrder: 2,
    },
    {
      id: 103,
      systemId: 'us_usda',
      groupCode: 'carb',
      displayNameEs: 'Starch',
      choG: 15,
      proG: 3,
      fatG: 1,
      kcalTarget: 80,
      sortOrder: 3,
    },
    {
      id: 104,
      systemId: 'us_usda',
      groupCode: 'protein',
      displayNameEs: 'Protein',
      choG: 0,
      proG: 7,
      fatG: 3,
      kcalTarget: 75,
      sortOrder: 4,
    },
    {
      id: 105,
      systemId: 'us_usda',
      groupCode: 'fat',
      displayNameEs: 'Fat',
      choG: 0,
      proG: 0,
      fatG: 5,
      kcalTarget: 45,
      sortOrder: 5,
    },
  ],
  es_exchange: [
    {
      id: 201,
      systemId: 'es_exchange',
      groupCode: 'vegetable',
      displayNameEs: 'Verduras',
      choG: 5,
      proG: 2,
      fatG: 0,
      kcalTarget: 25,
      sortOrder: 1,
    },
    {
      id: 202,
      systemId: 'es_exchange',
      groupCode: 'fruit',
      displayNameEs: 'Frutas',
      choG: 15,
      proG: 0,
      fatG: 0,
      kcalTarget: 60,
      sortOrder: 2,
    },
    {
      id: 203,
      systemId: 'es_exchange',
      groupCode: 'carb',
      displayNameEs: 'Cereales y farinaceos',
      choG: 15,
      proG: 2,
      fatG: 1,
      kcalTarget: 75,
      sortOrder: 3,
    },
    {
      id: 204,
      systemId: 'es_exchange',
      groupCode: 'protein',
      displayNameEs: 'Proteinas',
      choG: 0,
      proG: 7,
      fatG: 3,
      kcalTarget: 75,
      sortOrder: 4,
    },
    {
      id: 205,
      systemId: 'es_exchange',
      groupCode: 'fat',
      displayNameEs: 'Grasas',
      choG: 0,
      proG: 0,
      fatG: 5,
      kcalTarget: 45,
      sortOrder: 5,
    },
  ],
  ar_exchange: [
    {
      id: 301,
      systemId: 'ar_exchange',
      groupCode: 'vegetable',
      displayNameEs: 'Verduras',
      choG: 5,
      proG: 2,
      fatG: 0,
      kcalTarget: 25,
      sortOrder: 1,
    },
    {
      id: 302,
      systemId: 'ar_exchange',
      groupCode: 'fruit',
      displayNameEs: 'Frutas',
      choG: 15,
      proG: 0,
      fatG: 0,
      kcalTarget: 60,
      sortOrder: 2,
    },
    {
      id: 303,
      systemId: 'ar_exchange',
      groupCode: 'carb',
      displayNameEs: 'Cereales y feculas',
      choG: 15,
      proG: 2,
      fatG: 1,
      kcalTarget: 75,
      sortOrder: 3,
    },
    {
      id: 304,
      systemId: 'ar_exchange',
      groupCode: 'protein',
      displayNameEs: 'Proteinas',
      choG: 0,
      proG: 7,
      fatG: 3,
      kcalTarget: 75,
      sortOrder: 4,
    },
    {
      id: 305,
      systemId: 'ar_exchange',
      groupCode: 'fat',
      displayNameEs: 'Grasas',
      choG: 0,
      proG: 0,
      fatG: 5,
      kcalTarget: 45,
      sortOrder: 5,
    },
  ],
};

export const DEFAULT_SUBGROUPS_BY_SYSTEM: Partial<Record<ExchangeSystemId, ExchangeSubgroupDefinition[]>> = {
  mx_smae: [
    // --- AOA (protein) subgroups ---
    {
      id: 1,
      systemId: 'mx_smae',
      parentGroupCode: 'protein',
      subgroupCode: 'aoa_muy_bajo_grasa',
      displayNameEs: 'AOA muy bajo aporte de grasa',
      choG: 0,
      proG: 7,
      fatG: 1,
      kcalTarget: 40,
      sortOrder: 1,
    },
    {
      id: 2,
      systemId: 'mx_smae',
      parentGroupCode: 'protein',
      subgroupCode: 'aoa_bajo_grasa',
      displayNameEs: 'AOA bajo aporte de grasa',
      choG: 0,
      proG: 7,
      fatG: 3,
      kcalTarget: 55,
      sortOrder: 2,
    },
    {
      id: 3,
      systemId: 'mx_smae',
      parentGroupCode: 'protein',
      subgroupCode: 'aoa_moderado_grasa',
      displayNameEs: 'AOA moderado aporte de grasa',
      choG: 0,
      proG: 7,
      fatG: 5,
      kcalTarget: 75,
      sortOrder: 3,
    },
    {
      id: 4,
      systemId: 'mx_smae',
      parentGroupCode: 'protein',
      subgroupCode: 'aoa_alto_grasa',
      displayNameEs: 'AOA alto aporte de grasa',
      choG: 0,
      proG: 7,
      fatG: 8,
      kcalTarget: 100,
      sortOrder: 4,
    },
    // --- Cereales (carb) subgroups ---
    {
      id: 5,
      systemId: 'mx_smae',
      parentGroupCode: 'carb',
      subgroupCode: 'cereal_sin_grasa',
      displayNameEs: 'Cereales sin grasa',
      choG: 15,
      proG: 2,
      fatG: 0,
      kcalTarget: 70,
      sortOrder: 5,
    },
    {
      id: 6,
      systemId: 'mx_smae',
      parentGroupCode: 'carb',
      subgroupCode: 'cereal_con_grasa',
      displayNameEs: 'Cereales con grasa',
      choG: 15,
      proG: 2,
      fatG: 5,
      kcalTarget: 115,
      sortOrder: 6,
    },
    // --- Leche (milk) subgroups ---
    {
      id: 7,
      systemId: 'mx_smae',
      parentGroupCode: 'milk',
      subgroupCode: 'leche_descremada',
      displayNameEs: 'Leche descremada',
      choG: 12,
      proG: 9,
      fatG: 2,
      kcalTarget: 95,
      sortOrder: 7,
    },
    {
      id: 8,
      systemId: 'mx_smae',
      parentGroupCode: 'milk',
      subgroupCode: 'leche_semidescremada',
      displayNameEs: 'Leche semidescremada',
      choG: 12,
      proG: 9,
      fatG: 4,
      kcalTarget: 110,
      sortOrder: 8,
    },
    {
      id: 9,
      systemId: 'mx_smae',
      parentGroupCode: 'milk',
      subgroupCode: 'leche_entera',
      displayNameEs: 'Leche entera',
      choG: 12,
      proG: 9,
      fatG: 8,
      kcalTarget: 150,
      sortOrder: 9,
    },
    {
      id: 10,
      systemId: 'mx_smae',
      parentGroupCode: 'milk',
      subgroupCode: 'leche_con_azucar',
      displayNameEs: 'Leche con azucar',
      choG: 30,
      proG: 8,
      fatG: 5,
      kcalTarget: 200,
      sortOrder: 10,
    },
    // --- Azucares (sugar) subgroups ---
    {
      id: 11,
      systemId: 'mx_smae',
      parentGroupCode: 'sugar',
      subgroupCode: 'azucar_sin_grasa',
      displayNameEs: 'Azucares sin grasa',
      choG: 10,
      proG: 0,
      fatG: 0,
      kcalTarget: 40,
      sortOrder: 11,
    },
    {
      id: 12,
      systemId: 'mx_smae',
      parentGroupCode: 'sugar',
      subgroupCode: 'azucar_con_grasa',
      displayNameEs: 'Azucares con grasa',
      choG: 10,
      proG: 0,
      fatG: 5,
      kcalTarget: 85,
      sortOrder: 12,
    },
    // --- Grasas (fat) subgroups ---
    {
      id: 13,
      systemId: 'mx_smae',
      parentGroupCode: 'fat',
      subgroupCode: 'grasa_sin_proteina',
      displayNameEs: 'Grasas sin proteina',
      choG: 0,
      proG: 0,
      fatG: 5,
      kcalTarget: 45,
      sortOrder: 13,
    },
    {
      id: 14,
      systemId: 'mx_smae',
      parentGroupCode: 'fat',
      subgroupCode: 'grasa_con_proteina',
      displayNameEs: 'Grasas con proteina',
      choG: 3,
      proG: 3,
      fatG: 5,
      kcalTarget: 70,
      sortOrder: 14,
    },
  ],
};

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
