import type { CountryCode } from '../catalog/geography';
import type { Goal, KcalSelectionPolicyDefinition } from '../catalog/systems';
import type { PatientProfile } from '../types';
import type { FoodItem, FoodRankReason, RankedFoodItem } from '../types';

const normalize = (value: string): string => value.trim().toLowerCase();

const goalCompatibilityScore = (goal: Goal, food: FoodItem): number => {
  const proteinDensity = food.proteinG / Math.max(1, food.caloriesKcal);

  if (goal === 'lose_fat') {
    return food.caloriesKcal <= 200 ? 10 : proteinDensity > 0.08 ? 6 : -6;
  }

  if (goal === 'gain_muscle') {
    return proteinDensity > 0.08 ? 10 : food.carbsG > 20 ? 6 : 0;
  }

  return proteinDensity > 0.06 ? 6 : 2;
};

const hasTag = (food: FoodItem, type: string, value: string): boolean => {
  return (
    food.tags?.some(
      (tag) => normalize(tag.type) === normalize(type) && normalize(tag.value) === normalize(value),
    ) ?? false
  );
};

const collectTextMatches = (textValues: string[], targetValues: string[]): boolean => {
  const normalizedText = textValues.map(normalize);
  return targetValues.some((target) => normalizedText.some((text) => text.includes(normalize(target))));
};

const isAoaSubgroup = (subgroupCode: string | undefined): boolean =>
  Boolean(subgroupCode?.toLowerCase().startsWith('aoa_'));

const hasGeoMetadata = (food: FoodItem): boolean => {
  const hasCountryAvailability = Array.isArray(food.countryAvailability) && food.countryAvailability.length > 0;
  const hasStateAvailability = Array.isArray(food.stateAvailability) && food.stateAvailability.length > 0;
  const hasGeoWeight = typeof food.geoWeight === 'number' && Number.isFinite(food.geoWeight);

  return hasCountryAvailability || hasStateAvailability || hasGeoWeight;
};

export type RankFoodsOptions = {
  subgroupScoreAdjustments?: Record<string, number>;
  targetCalories?: number;
  bucketKcalTargets?: Record<string, number>;
  kcalPolicy?: KcalSelectionPolicyDefinition;
};

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const evaluateFood = (
  food: FoodItem,
  profile: PatientProfile,
  options?: RankFoodsOptions,
): RankedFoodItem | null => {
  const reasons: FoodRankReason[] = [];
  let score = 0;

  const subgroupCode = food.subgroupCode?.toString();
  const bucketCode = subgroupCode ?? food.groupCode;

  if (profile.dietPattern === 'vegan' && isAoaSubgroup(subgroupCode)) {
    return null;
  }

  const allergies = profile.allergies.map(normalize);
  for (const allergy of allergies) {
    if (hasTag(food, 'allergen', allergy)) {
      return null;
    }
  }

  const intolerances = profile.intolerances.map(normalize);
  for (const intolerance of intolerances) {
    if (hasTag(food, 'intolerance', intolerance)) {
      return null;
    }
  }

  if (food.countryAvailability && food.countryAvailability.length > 0) {
    if (food.countryAvailability.includes(profile.countryCode as CountryCode)) {
      score += 25;
      reasons.push({ code: 'country_match', label: 'Disponible en el pais seleccionado', impact: 25 });
    }
  }

  if (food.stateAvailability?.includes(profile.stateCode)) {
    score += 12;
    reasons.push({ code: 'state_match', label: 'Coincide con estado/provincia', impact: 12 });
  }

  if (food.geoWeight) {
    score += food.geoWeight;
  }

  if (!hasGeoMetadata(food)) {
    score += 5;
    reasons.push({ code: 'fallback_neutral', label: 'Sin metadata geografica, se aplica fallback', impact: 5 });
  }

  const goalScore = goalCompatibilityScore(profile.goal, food);
  score += goalScore;
  reasons.push({ code: 'goal_support', label: 'Alineado al objetivo nutricional', impact: goalScore });

  if (hasTag(food, 'budget', profile.budgetLevel)) {
    score += 8;
    reasons.push({ code: 'budget_match', label: 'Ajustado al presupuesto', impact: 8 });
  }

  if (hasTag(food, 'prep_time', profile.prepTimeLevel)) {
    score += 7;
    reasons.push({ code: 'prep_match', label: 'Ajustado al tiempo de preparacion', impact: 7 });
  }

  if (hasTag(food, 'diet', profile.dietPattern)) {
    score += 10;
    reasons.push({ code: 'diet_pattern', label: 'Compatible con patron alimentario', impact: 10 });
  }

  if (collectTextMatches([food.name], profile.likes)) {
    score += 10;
    reasons.push({ code: 'liked', label: 'Relacionado con preferencias', impact: 10 });
  }

  if (collectTextMatches([food.name], profile.dislikes)) {
    score -= 12;
    reasons.push({ code: 'disliked_penalty', label: 'Coincide con alimento no preferido', impact: -12 });
  }

  if (profile.dietPattern === 'vegetarian' && subgroupCode === 'aoa_alto_grasa') {
    score -= 8;
    reasons.push({ code: 'subgroup_goal_fit', label: 'Penalizacion por AOA alto en patron vegetariano', impact: -8 });
  }

  const subgroupAdjustment = options?.subgroupScoreAdjustments?.[bucketCode];
  if (typeof subgroupAdjustment === 'number' && subgroupAdjustment !== 0) {
    score += subgroupAdjustment;
    reasons.push({
      code: 'subgroup_goal_fit',
      label: 'Ajuste de subgrupo por objetivo/contexto',
      impact: subgroupAdjustment,
    });
  }

  const refKcal = options?.bucketKcalTargets?.[bucketCode];
  const targetCalories = options?.targetCalories;
  const kcalPolicy = options?.kcalPolicy;

  if (
    typeof refKcal === 'number' &&
    refKcal > 0 &&
    typeof targetCalories === 'number' &&
    Number.isFinite(targetCalories) &&
    kcalPolicy
  ) {
    const span = Math.max(1, kcalPolicy.highTargetKcal - kcalPolicy.lowTargetKcal);
    const alpha = clamp((targetCalories - kcalPolicy.lowTargetKcal) / span, 0, 1);
    const tolerancePct =
      kcalPolicy.minTolerancePct +
      (kcalPolicy.maxTolerancePct - kcalPolicy.minTolerancePct) * alpha;
    const allowedAbsDiff = Math.max(kcalPolicy.minToleranceKcal, refKcal * tolerancePct);
    const hardAbsDiff = allowedAbsDiff * kcalPolicy.hardOutlierMultiplier;
    const absDiff = Math.abs(food.caloriesKcal - refKcal);

    if (kcalPolicy.excludeHardOutliers && absDiff > hardAbsDiff) {
      return null;
    }

    if (absDiff > allowedAbsDiff) {
      const overPct = (absDiff - allowedAbsDiff) / Math.max(refKcal, 1);
      const rawPenalty = (overPct / 0.1) * kcalPolicy.softPenaltyPer10Pct;
      const penalty = -Math.min(24, Math.round(rawPenalty));

      if (penalty !== 0) {
        score += penalty;
        reasons.push({
          code: 'kcal_fit',
          label: 'Ajuste calorico segun requerimiento energetico',
          impact: penalty,
        });
      }
    }
  }

  return {
    ...food,
    score,
    reasons,
  };
};

export const rankFoods = (
  foods: FoodItem[],
  profile: PatientProfile,
  options?: RankFoodsOptions,
): RankedFoodItem[] => {
  const ranked: RankedFoodItem[] = [];

  for (const food of foods) {
    const result = evaluateFood(food, profile, options);
    if (result) ranked.push(result);
  }

  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};

export const groupTopFoods = (
  rankedFoods: RankedFoodItem[],
  topPerGroup: number,
): Record<string, RankedFoodItem[]> => {
  return rankedFoods.reduce<Record<string, RankedFoodItem[]>>((acc, item) => {
    const key = item.subgroupCode ?? item.groupCode;
    const bucket = acc[key] ?? [];
    if (bucket.length < topPerGroup) {
      bucket.push(item);
      acc[key] = bucket;
    }

    return acc;
  }, {});
};

