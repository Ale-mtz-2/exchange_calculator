import {
  DEFAULT_KCAL_SELECTION_POLICIES_BY_SYSTEM,
  calculateEnergyTargets,
  distributeMeals,
  groupTopFoods,
  rankFoods,
  type DietPattern,
  type ExchangeGroupCode,
  type ExchangeSystemId,
  type Goal,
  type KcalSelectionPolicyDefinition,
} from '@equivalentes/shared';
import type {
  EquivalentBucketCatalogItem,
  EquivalentBucketPlanV2,
  EquivalentPlanResponseV2,
  FoodItemV2,
  RankedFoodItemV2,
  PatientProfile,
} from '@equivalentes/shared';

import { prisma } from '../db/prisma.js';
import { nutritionPool } from '../db/pg.js';
import { env } from '../config/env.js';
import { safeSchema } from '../utils/sql.js';
import { inferGroupCodeFromText } from './groupCodeMapper.js';
import {
  getLatestBucketProfileVersion,
  loadBucketProfiles,
  type ExchangeBucketProfileRow,
} from './bucketProfileBuilder.js';
import { loadFoodsForSystemV2 } from './nutritionCatalogV2.js';

const appSchema = safeSchema(env.DB_APP_SCHEMA);

const roundHalf = (value: number): number => Math.max(0, Math.round(value * 2) / 2);

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

const SWEET_PREFERENCE_KEYWORDS = [
  'nieve',
  'helado',
  'postre',
  'dulce',
  'chocolate',
  'cajeta',
  'miel',
  'caramelo',
  'azucar',
];

const FIXED_GROUP_EXCHANGES: Record<string, number> = {
  vegetable: 3,
  fruit: 2,
};

const familySortOrder: Record<ExchangeGroupCode, number> = {
  vegetable: 1,
  fruit: 2,
  legume: 3,
  protein: 4,
  milk: 5,
  sugar: 6,
  fat: 7,
  carb: 8,
};

type GroupBucketProfile = ExchangeBucketProfileRow & {
  familyCode: ExchangeGroupCode;
};

type GroupNameById = Map<number, string>;

type SubgroupPolicyResolved = {
  subgroupId: number;
  targetSharePct: number;
  scoreAdjustment: number;
};

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

const hasSweetPreferenceSignal = (likes: string[]): boolean => {
  const normalizedLikes = likes.map(normalizeText).filter(Boolean);
  return normalizedLikes.some((like) => SWEET_PREFERENCE_KEYWORDS.some((keyword) => like.includes(keyword)));
};

const shouldApplySugarFloor = (
  profile: Pick<PatientProfile, 'goal' | 'hasDiabetes' | 'likes'>,
): boolean => {
  if (profile.goal !== 'lose_fat') return false;
  if (profile.hasDiabetes) return false;
  return hasSweetPreferenceSignal(profile.likes);
};

const shouldApplyFatFloor = (
  profile: Pick<PatientProfile, 'goal' | 'hasDyslipidemia'>,
): boolean => profile.goal === 'lose_fat' && !profile.hasDyslipidemia;

const estimateExchanges = (
  familyCode: ExchangeGroupCode,
  profile: GroupBucketProfile,
  remainingCho: number,
  remainingPro: number,
  remainingFat: number,
): number => {
  if (familyCode === 'protein' && profile.proG > 0) {
    return remainingPro / profile.proG;
  }

  if (familyCode === 'fat' && profile.fatG > 0) {
    return remainingFat / profile.fatG;
  }

  if (familyCode === 'legume') {
    const byPro = profile.proG > 0 ? remainingPro / profile.proG : Number.POSITIVE_INFINITY;
    const byCho = profile.choG > 0 ? remainingCho / profile.choG : Number.POSITIVE_INFINITY;
    return Math.min(byPro, byCho);
  }

  if (profile.choG > 0) {
    return remainingCho / profile.choG;
  }

  if (profile.proG > 0) {
    return remainingPro / profile.proG;
  }

  if (profile.fatG > 0) {
    return remainingFat / profile.fatG;
  }

  return 0;
};

const contribution = (exchanges: number, profile: { choG: number; proG: number; fatG: number; kcal: number }) => ({
  choG: exchanges * profile.choG,
  proG: exchanges * profile.proG,
  fatG: exchanges * profile.fatG,
  kcal: exchanges * profile.kcal,
});

const distributeByShares = (
  totalExchanges: number,
  rows: Array<{ subgroupId: number; weight: number }>,
): Map<number, number> => {
  const result = new Map<number, number>();
  if (totalExchanges <= 0 || rows.length === 0) return result;

  const totalWeight = rows.reduce((acc, row) => acc + row.weight, 0);
  const normalizedRows = totalWeight > 0
    ? rows.map((row) => ({ subgroupId: row.subgroupId, weight: row.weight / totalWeight }))
    : rows.map((row) => ({ subgroupId: row.subgroupId, weight: 1 / rows.length }));

  for (const row of normalizedRows) {
    result.set(row.subgroupId, roundHalf(totalExchanges * row.weight));
  }

  const target = roundHalf(totalExchanges);
  let current = Array.from(result.values()).reduce((acc, value) => acc + value, 0);
  let diff = roundHalf(target - current);
  const priorityOrder = [...normalizedRows].sort((a, b) => b.weight - a.weight);

  while (Math.abs(diff) >= 0.5) {
    let changed = false;
    for (const row of priorityOrder) {
      if (Math.abs(diff) < 0.5) break;

      const existing = result.get(row.subgroupId) ?? 0;
      if (diff > 0) {
        result.set(row.subgroupId, existing + 0.5);
        diff = roundHalf(diff - 0.5);
        changed = true;
      } else if (existing > 0) {
        result.set(row.subgroupId, Math.max(0, existing - 0.5));
        diff = roundHalf(diff + 0.5);
        changed = true;
      }
    }

    current = Array.from(result.values()).reduce((acc, value) => acc + value, 0);
    if (!changed || current === target) break;
  }

  return result;
};

const resolveKcalSelectionPolicy = (
  profile: PatientProfile,
  dbPolicy: Awaited<ReturnType<typeof prisma.kcalSelectionPolicy.findFirst>>,
): KcalSelectionPolicyDefinition => {
  if (dbPolicy) {
    return {
      systemId: profile.systemId,
      lowTargetKcal: dbPolicy.lowTargetKcal,
      highTargetKcal: dbPolicy.highTargetKcal,
      minTolerancePct: Number(dbPolicy.minTolerancePct),
      maxTolerancePct: Number(dbPolicy.maxTolerancePct),
      minToleranceKcal: dbPolicy.minToleranceKcal,
      softPenaltyPer10Pct: Number(dbPolicy.softPenaltyPer10Pct),
      hardOutlierMultiplier: Number(dbPolicy.hardOutlierMultiplier),
      excludeHardOutliers: dbPolicy.excludeHardOutliers,
    };
  }

  return DEFAULT_KCAL_SELECTION_POLICIES_BY_SYSTEM[profile.systemId];
};

const selectPolicies = <T extends { goal: string; dietPattern: string }>(
  policies: T[],
  goal: Goal,
  dietPattern: DietPattern,
): T[] => {
  const byGoal = policies.filter((policy) => policy.goal === goal);
  const exact = byGoal.filter((policy) => policy.dietPattern === dietPattern);
  if (exact.length > 0) return exact;
  return byGoal.filter((policy) => policy.dietPattern === 'any');
};

const loadSubgroupPolicies = async (
  profile: PatientProfile,
  subgroupProfiles: ExchangeBucketProfileRow[],
): Promise<SubgroupPolicyResolved[]> => {
  const policyRows = await nutritionPool.query<{
    goal: string;
    diet_pattern: string;
    subgroup_id: number;
    target_share_pct: number;
    score_adjustment: number;
  }>(
    `
      SELECT
        goal,
        diet_pattern,
        subgroup_id,
        target_share_pct::float8,
        score_adjustment::float8
      FROM ${appSchema}.subgroup_selection_policies
      WHERE system_id = $1
        AND is_active = true
        AND subgroup_id IS NOT NULL;
    `,
    [profile.systemId],
  );

  const subgroupIdSet = new Set<number>(subgroupProfiles.map((subgroup) => subgroup.bucketId));

  const selected = selectPolicies(
    policyRows.rows.map((row) => ({
      goal: row.goal,
      dietPattern: row.diet_pattern,
      subgroupId: row.subgroup_id,
      targetSharePct: row.target_share_pct,
      scoreAdjustment: row.score_adjustment,
    })),
    profile.goal,
    profile.dietPattern,
  );

  return selected
    .map((policy) => {
      const subgroupId = policy.subgroupId;
      if (!subgroupIdSet.has(subgroupId)) return null;

      return {
        subgroupId,
        targetSharePct: policy.targetSharePct,
        scoreAdjustment: policy.scoreAdjustment,
      };
    })
    .filter((policy): policy is SubgroupPolicyResolved => policy !== null);
};

const buildGroupPlan = (
  targets: EquivalentPlanResponseV2['targets'],
  groups: GroupBucketProfile[],
  profile: PatientProfile,
): EquivalentBucketPlanV2[] => {
  const sorted = [...groups].sort((a, b) => {
    const orderA = familySortOrder[a.familyCode] ?? 999;
    const orderB = familySortOrder[b.familyCode] ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.bucketId - b.bucketId;
  });

  let remainingCho = targets.carbsG;
  let remainingPro = targets.proteinG;
  let remainingFat = targets.fatG;

  const exchangesByGroup = new Map<number, number>();

  for (const group of sorted) {
    const fixed = FIXED_GROUP_EXCHANGES[group.familyCode];
    if (fixed === undefined) continue;

    exchangesByGroup.set(group.bucketId, fixed);
    const used = contribution(fixed, group);
    remainingCho -= used.choG;
    remainingPro -= used.proG;
    remainingFat -= used.fatG;
  }

  const minExchangesByFamily = new Map<ExchangeGroupCode, number>();
  if (shouldApplyFatFloor(profile)) {
    minExchangesByFamily.set('fat', 1);
  }
  if (shouldApplySugarFloor(profile)) {
    minExchangesByFamily.set('sugar', 0.5);
  }

  for (const [familyCode, minExchanges] of minExchangesByFamily.entries()) {
    const group = sorted.find((item) => item.familyCode === familyCode);
    if (!group || exchangesByGroup.has(group.bucketId)) continue;

    const floor = roundHalf(clamp(minExchanges, 0, 30));
    exchangesByGroup.set(group.bucketId, floor);
    const used = contribution(floor, group);
    remainingCho -= used.choG;
    remainingPro -= used.proG;
    remainingFat -= used.fatG;
  }

  for (const group of sorted) {
    if (exchangesByGroup.has(group.bucketId)) continue;

    const estimated = estimateExchanges(
      group.familyCode,
      group,
      remainingCho,
      remainingPro,
      remainingFat,
    );
    const exchanges =
      profile.hasDiabetes && group.familyCode === 'sugar'
        ? 0
        : roundHalf(clamp(estimated, 0, 30));
    exchangesByGroup.set(group.bucketId, exchanges);

    const used = contribution(exchanges, group);
    remainingCho -= used.choG;
    remainingPro -= used.proG;
    remainingFat -= used.fatG;
  }

  return sorted.map((group) => {
    const exchanges = exchangesByGroup.get(group.bucketId) ?? 0;
    const totals = contribution(exchanges, group);

    return {
      bucketType: 'group',
      bucketId: group.bucketId,
      bucketKey: `group:${group.bucketId}`,
      bucketName: group.bucketName,
      legacyCode: group.familyCode,
      exchangesPerDay: exchanges,
      choG: totals.choG,
      proG: totals.proG,
      fatG: totals.fatG,
      kcal: totals.kcal,
    };
  });
};

const buildSubgroupPlan = (
  groupPlan: EquivalentBucketPlanV2[],
  subgroupProfiles: ExchangeBucketProfileRow[],
  subgroupPolicies: SubgroupPolicyResolved[],
  profile: PatientProfile,
): EquivalentBucketPlanV2[] => {
  const subgroupProfileById = new Map<number, ExchangeBucketProfileRow>(
    subgroupProfiles.map((profile) => [profile.bucketId, profile]),
  );
  const subgroupPoliciesById = new Map<number, SubgroupPolicyResolved>(
    subgroupPolicies.map((policy) => [policy.subgroupId, policy]),
  );

  const rows: EquivalentBucketPlanV2[] = [];
  const applyFatOverride = shouldApplyFatFloor(profile);
  const applySugarOverride = shouldApplySugarFloor(profile);

  for (const group of groupPlan) {
    const groupId = group.bucketId;
    const candidates = subgroupProfiles.filter((profile) => profile.parentGroupId === groupId);
    if (candidates.length === 0 || group.exchangesPerDay <= 0) continue;

    const subgroupOverrideByLegacyCode = new Map<string, number>();
    if (group.legacyCode === 'fat' && applyFatOverride) {
      subgroupOverrideByLegacyCode.set('grasa_sin_proteina', 60);
      subgroupOverrideByLegacyCode.set('grasa_con_proteina', 40);
    }
    if (group.legacyCode === 'sugar' && applySugarOverride) {
      subgroupOverrideByLegacyCode.set('azucar_sin_grasa', 100);
      subgroupOverrideByLegacyCode.set('azucar_con_grasa', 0);
    }

    const weightedCandidates = candidates.map((candidate) => {
      const policy = subgroupPoliciesById.get(candidate.bucketId);
      const overrideWeight = candidate.legacyCode
        ? subgroupOverrideByLegacyCode.get(candidate.legacyCode)
        : undefined;
      const weight = overrideWeight ?? policy?.targetSharePct ?? candidate.sampleSize;
      return { subgroupId: candidate.bucketId, weight };
    });

    const distribution = distributeByShares(group.exchangesPerDay, weightedCandidates);
    for (const [subgroupId, exchanges] of distribution.entries()) {
      const subgroup = subgroupProfileById.get(subgroupId);
      if (!subgroup) continue;

      const totals = contribution(exchanges, subgroup);
      rows.push({
        bucketType: 'subgroup',
        bucketId: subgroupId,
        bucketKey: `subgroup:${subgroupId}`,
        bucketName: subgroup.bucketName,
        ...(subgroup.legacyCode ? { legacyCode: subgroup.legacyCode } : {}),
        exchangesPerDay: exchanges,
        choG: totals.choG,
        proG: totals.proG,
        fatG: totals.fatG,
        kcal: totals.kcal,
      });
    }
  }

  return rows;
};

const bucketProfileSort = (a: ExchangeBucketProfileRow, b: ExchangeBucketProfileRow): number => {
  if (a.bucketType !== b.bucketType) {
    return a.bucketType === 'group' ? -1 : 1;
  }

  if (a.bucketType === 'subgroup' && b.bucketType === 'subgroup') {
    const parentA = a.parentGroupId ?? Number.MAX_SAFE_INTEGER;
    const parentB = b.parentGroupId ?? Number.MAX_SAFE_INTEGER;
    if (parentA !== parentB) return parentA - parentB;
  }

  return a.bucketId - b.bucketId;
};

const buildBucketCatalog = (
  profiles: ExchangeBucketProfileRow[],
  groupNameById: GroupNameById,
): EquivalentBucketCatalogItem[] =>
  [...profiles]
    .sort(bucketProfileSort)
    .map((profileRow) => ({
      bucketType: profileRow.bucketType,
      bucketId: profileRow.bucketId,
      bucketKey: `${profileRow.bucketType}:${profileRow.bucketId}`,
      bucketName: profileRow.bucketName,
      ...(profileRow.parentGroupId !== null ? { parentGroupId: profileRow.parentGroupId } : {}),
      ...(profileRow.parentGroupId !== null && groupNameById.get(profileRow.parentGroupId)
        ? { parentGroupName: groupNameById.get(profileRow.parentGroupId) as string }
        : {}),
      ...(profileRow.legacyCode ? { legacyCode: profileRow.legacyCode } : {}),
      choPerExchange: profileRow.choG,
      proPerExchange: profileRow.proG,
      fatPerExchange: profileRow.fatG,
      kcalPerExchange: profileRow.kcal,
    }));

export const generateEquivalentPlanV2 = async (
  cid: string,
  profile: PatientProfile,
): Promise<EquivalentPlanResponseV2> => {
  const targets = calculateEnergyTargets(profile);
  const systemId = profile.systemId as ExchangeSystemId;

  const [profileVersion, dbKcalPolicy, { foods }] = await Promise.all([
    getLatestBucketProfileVersion(systemId),
    prisma.kcalSelectionPolicy.findFirst({
      where: {
        systemId: profile.systemId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    loadFoodsForSystemV2(profile),
  ]);

  if (!profileVersion) {
    throw new Error(
      `No bucket profile version found for ${systemId}. Run: pnpm --filter @equivalentes/api sync:bucket-profiles --version YYYYMMDD`,
    );
  }

  const profiles = await loadBucketProfiles(systemId, profileVersion);
  if (profiles.length === 0) {
    throw new Error(`No bucket profiles found for system ${systemId} and version ${profileVersion}`);
  }

  const groupProfiles: GroupBucketProfile[] = profiles
    .filter((profileRow) => profileRow.bucketType === 'group')
    .map((profileRow) => ({
      ...profileRow,
      familyCode: inferGroupCodeFromText(profileRow.bucketName),
    }));
  const subgroupProfiles = profiles.filter((profileRow) => profileRow.bucketType === 'subgroup');
  const groupNameById = new Map<number, string>(groupProfiles.map((group) => [group.bucketId, group.bucketName]));
  const bucketCatalog = buildBucketCatalog(profiles, groupNameById);
  const bucketCatalogByKey = new Map<string, EquivalentBucketCatalogItem>(
    bucketCatalog.map((bucket) => [bucket.bucketKey, bucket]),
  );

  const subgroupPolicies = await loadSubgroupPolicies(profile, subgroupProfiles);
  const groupPlan = buildGroupPlan(targets, groupProfiles, profile);
  const subgroupPlan = buildSubgroupPlan(groupPlan, subgroupProfiles, subgroupPolicies, profile);
  const bucketPlan = [...groupPlan, ...subgroupPlan];

  const subgroupScoreAdjustments = subgroupPolicies.reduce<Record<string, number>>((acc, policy) => {
    const key = `subgroup:${policy.subgroupId}`;
    acc[key] = policy.scoreAdjustment;
    return acc;
  }, {});

  const bucketKcalTargets = profiles.reduce<Record<string, number>>((acc, profileRow) => {
    acc[`${profileRow.bucketType}:${profileRow.bucketId}`] = profileRow.kcal;
    return acc;
  }, {});

  const kcalPolicy = resolveKcalSelectionPolicy(profile, dbKcalPolicy);
  const rankedFoods = rankFoods(
    foods as unknown as FoodItemV2[],
    profile,
    {
      subgroupScoreAdjustments,
      targetCalories: targets.targetCalories,
      bucketKcalTargets,
      kcalPolicy,
    },
  ) as RankedFoodItemV2[];

  const topFoodsByBucket = groupTopFoods(rankedFoods as any, 6) as Record<string, RankedFoodItemV2[]>;
  for (const bucket of bucketCatalog) {
    if (!topFoodsByBucket[bucket.bucketKey]) {
      topFoodsByBucket[bucket.bucketKey] = [];
    }
  }

  const extendedFoods = rankedFoods.slice(0, 300);

  const persistedPlan = await prisma.generatedPlan.create({
    data: {
      cid,
      countryCode: profile.countryCode,
      stateCode: profile.stateCode,
      systemId: profile.systemId,
      formulaId: profile.formulaId,
      inputs: profile,
      targets,
      equivalents: {
        version: 'v2',
        profileVersion,
        bucketPlan,
      },
    },
  });

  const topRecommendations = bucketPlan.flatMap((bucket) =>
    (topFoodsByBucket[bucket.bucketKey] ?? []).slice(0, 6).map((food) => ({
      planId: persistedPlan.id,
      foodId: food.id,
      groupCode: bucket.bucketKey,
      rankScore: food.score,
      reasons: food.reasons,
      isExtended: false,
    })),
  );

  const extendedRecommendations = extendedFoods.map((food) => ({
    planId: persistedPlan.id,
    foodId: food.id,
    groupCode: food.bucketKey,
    rankScore: food.score,
    reasons: food.reasons,
    isExtended: true,
  }));

  await prisma.generatedPlanRecommendation.createMany({
    data: [...topRecommendations, ...extendedRecommendations],
  });

  const mealDistribution = distributeMeals(
    bucketPlan.map((bucket) => {
      const catalogBucket = bucketCatalogByKey.get(bucket.bucketKey);
      return {
        bucketKey: bucket.bucketKey,
        ...(bucket.legacyCode ? { legacyCode: bucket.legacyCode } : {}),
        bucketType: bucket.bucketType,
        bucketId: bucket.bucketId,
        ...(catalogBucket?.bucketType === 'subgroup' && typeof catalogBucket.parentGroupId === 'number'
          ? { parentGroupId: catalogBucket.parentGroupId }
          : {}),
        kcalPerExchange: bucket.exchangesPerDay > 0 ? bucket.kcal / bucket.exchangesPerDay : 0,
        exchangesPerDay: bucket.exchangesPerDay,
      };
    }),
    profile,
  );

  return {
    version: 'v2',
    profileVersion,
    profile,
    targets,
    bucketCatalog,
    bucketPlan,
    topFoodsByBucket,
    extendedFoods,
    mealDistribution,
  };
};

export const __testables = {
  buildGroupPlan,
  buildSubgroupPlan,
  hasSweetPreferenceSignal,
  shouldApplySugarFloor,
  shouldApplyFatFloor,
};
