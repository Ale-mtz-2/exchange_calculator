import type {
  ActivityLevel,
  BudgetLevel,
  DietPattern,
  ExchangeBucketCode,
  ExchangeGroupCode,
  ExchangeSubgroupCode,
  ExchangeSystemId,
  Goal,
  KcalFormulaId,
  PrepTimeLevel,
  Sex,
} from './catalog/systems';
import type { CountryCode } from './catalog/geography';

export type EventType = 'open' | 'generate' | 'export';
export type TrackingSource = 'whatsapp' | 'guest';
export type TrackingIdentityMode = 'query_cid' | 'guest_localstorage';

export type TrackingAttribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
  mcMsgId?: string;
  campaignKey: string;
};

export type TrackingMetaBase = {
  source: TrackingSource;
  identityMode: TrackingIdentityMode;
  manychatEligible?: boolean;
  attribution?: TrackingAttribution;
};

export type EventMetaGenerate = {
  source: TrackingSource;
  identityMode: TrackingIdentityMode;
  manychatEligible: boolean;
  attribution: TrackingAttribution;
  countryCode: CountryCode;
  stateCode: string;
  systemId: ExchangeSystemId;
  formulaId: KcalFormulaId;
  profile: Partial<PatientProfile>;
};

export type EventMetaExport = {
  source: TrackingSource;
  identityMode: TrackingIdentityMode;
  attribution: TrackingAttribution;
  formats: string[];
  itemsCount: number;
};

export type PatientProfile = {
  goal: Goal;
  goalDeltaKgPerWeek: number;
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  mealsPerDay: 3 | 4 | 5;
  countryCode: CountryCode;
  stateCode: string;
  systemId: ExchangeSystemId;
  formulaId: KcalFormulaId;
  dietPattern: DietPattern;
  allergies: string[];
  intolerances: string[];
  likes: string[];
  dislikes: string[];
  budgetLevel: BudgetLevel;
  prepTimeLevel: PrepTimeLevel;
};

export type EnergyTargets = {
  bmr: number;
  tdee: number;
  targetCalories: number;
  carbsG: number;
  proteinG: number;
  fatG: number;
};

export type EquivalentGroupPlan = {
  groupCode: ExchangeBucketCode | string;
  groupName: string;
  exchangesPerDay: number;
  choG: number;
  proG: number;
  fatG: number;
  kcal: number;
};

export type FoodTag = {
  type: 'allergen' | 'intolerance' | 'diet' | 'prep_time' | 'budget' | 'keyword';
  value: string;
  weight?: number;
};

export type FoodItem = {
  id: number;
  name: string;
  groupCode: ExchangeGroupCode | string;
  subgroupCode?: ExchangeSubgroupCode | string;
  countryAvailability?: CountryCode[];
  stateAvailability?: string[];
  carbsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  servingQty: number;
  servingUnit: string;
  tags?: FoodTag[];
  sourceSystemId?: ExchangeSystemId;
  geoWeight?: number;
};

export type FoodRankReason = {
  code:
  | 'country_match'
  | 'state_match'
  | 'group_match'
  | 'goal_support'
  | 'subgroup_goal_fit'
  | 'kcal_fit'
  | 'budget_match'
  | 'prep_match'
  | 'liked'
  | 'disliked_penalty'
  | 'diet_pattern'
  | 'allergen_block'
  | 'intolerance_block'
  | 'fallback_neutral';
  label: string;
  impact: number;
};

export type RankedFoodItem = FoodItem & {
  score: number;
  reasons: FoodRankReason[];
};

/** A single meal slot with its name and per-group exchange distribution */
export type MealSlot = {
  name: string;
  distribution: Record<string, number>;
};

/** Full meal distribution plan — one slot per meal */
export type MealDistributionPlan = MealSlot[];

export type EquivalentPlanResponse = {
  profile: PatientProfile;
  targets: EnergyTargets;
  groupPlan: EquivalentGroupPlan[];
  subgroupPlan?: EquivalentGroupPlan[];
  topFoodsByGroup: Record<string, RankedFoodItem[]>;
  extendedFoods: RankedFoodItem[];
  mealDistribution?: MealDistributionPlan;
};
