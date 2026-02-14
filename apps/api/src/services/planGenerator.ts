import {
  DEFAULT_GROUPS_BY_SYSTEM,
  DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM,
  DEFAULT_SUBGROUPS_BY_SYSTEM,
  buildEquivalentPlan,
  calculateEnergyTargets,
  distributeMeals,
  groupTopFoods,
  rankFoods,
  type DietPattern,
  type ExchangeBucketCode,
  type ExchangeSubgroupCode,
  type ExchangeSystemId,
  type Goal,
} from '@equivalentes/shared';
import type { EquivalentGroupPlan, EquivalentPlanResponse, PatientProfile } from '@equivalentes/shared';

import { isSmaeSubgroupsEnabled } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { loadFoodsForSystem } from './nutritionCatalog.js';

type GroupDefinition = {
  id: number;
  systemId: ExchangeSystemId;
  groupCode: string;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
  sortOrder: number;
};

type SubgroupDefinition = {
  id: number;
  systemId: ExchangeSystemId;
  parentGroupCode: string;
  subgroupCode: ExchangeSubgroupCode;
  displayNameEs: string;
  choG: number;
  proG: number;
  fatG: number;
  kcalTarget: number;
  sortOrder: number;
};

type SubgroupSelectionPolicy = {
  goal: Goal;
  dietPattern: DietPattern | 'any';
  subgroupCode: ExchangeSubgroupCode;
  targetSharePct: number;
  scoreAdjustment: number;
};

const roundHalf = (value: number): number => Math.max(0, Math.round(value * 2) / 2);

const contribution = (
  exchanges: number,
  item: { choG: number; proG: number; fatG: number; kcalTarget: number },
): Omit<EquivalentGroupPlan, 'groupCode' | 'groupName' | 'exchangesPerDay'> => ({
  choG: exchanges * item.choG,
  proG: exchanges * item.proG,
  fatG: exchanges * item.fatG,
  kcal: exchanges * item.kcalTarget,
});

const clamp = (value: number, minValue: number, maxValue: number): number =>
  Math.min(maxValue, Math.max(minValue, value));

const MX_OUTPUT_ORDER: ExchangeBucketCode[] = [
  'vegetable',
  'fruit',
  'cereal_sin_grasa',
  'cereal_con_grasa',
  'legume',
  'aoa_muy_bajo_grasa',
  'aoa_bajo_grasa',
  'aoa_moderado_grasa',
  'aoa_alto_grasa',
  'leche_descremada',
  'leche_semidescremada',
  'leche_entera',
  'leche_con_azucar',
  'grasa_sin_proteina',
  'grasa_con_proteina',
  'azucar_sin_grasa',
  'azucar_con_grasa',
];

const buildDefinitionsFromDb = (
  profile: PatientProfile,
  dbGroups: Awaited<ReturnType<typeof prisma.exchangeGroup.findMany>>,
): GroupDefinition[] => {
  const fromDb: GroupDefinition[] = dbGroups.map((group) => ({
    id: Number(group.id),
    systemId: group.systemId as ExchangeSystemId,
    groupCode: group.groupCode,
    displayNameEs: group.displayNameEs,
    choG: Number(group.choG),
    proG: Number(group.proG),
    fatG: Number(group.fatG),
    kcalTarget: group.kcalTarget,
    sortOrder: group.sortOrder,
  }));

  // Merge: DB entries take precedence, fill missing from defaults
  const dbCodes = new Set(fromDb.map((g) => g.groupCode));
  const defaults = DEFAULT_GROUPS_BY_SYSTEM[profile.systemId] ?? [];
  for (const def of defaults) {
    if (!dbCodes.has(def.groupCode)) {
      fromDb.push({
        id: def.id,
        systemId: def.systemId,
        groupCode: def.groupCode,
        displayNameEs: def.displayNameEs,
        choG: def.choG,
        proG: def.proG,
        fatG: def.fatG,
        kcalTarget: def.kcalTarget,
        sortOrder: def.sortOrder,
      });
    }
  }

  return fromDb.sort((a, b) => a.sortOrder - b.sortOrder);
};

const buildSubgroupsFromDb = (
  profile: PatientProfile,
  dbSubgroups: Array<{
    id: bigint;
    systemId: string;
    parentGroupId: bigint;
    subgroupCode: string;
    displayNameEs: string;
    choG: { toNumber(): number } | number;
    proG: { toNumber(): number } | number;
    fatG: { toNumber(): number } | number;
    kcalTarget: number;
    sortOrder: number;
    parentGroup: { groupCode: string };
  }>,
): SubgroupDefinition[] => {
  const fromDb: SubgroupDefinition[] = dbSubgroups.map((subgroup) => ({
    id: Number(subgroup.id),
    systemId: subgroup.systemId as ExchangeSystemId,
    parentGroupCode: subgroup.parentGroup.groupCode,
    subgroupCode: subgroup.subgroupCode as ExchangeSubgroupCode,
    displayNameEs: subgroup.displayNameEs,
    choG: Number(subgroup.choG),
    proG: Number(subgroup.proG),
    fatG: Number(subgroup.fatG),
    kcalTarget: subgroup.kcalTarget,
    sortOrder: subgroup.sortOrder,
  }));

  // Merge: DB entries take precedence, fill missing from defaults
  const dbCodes = new Set(fromDb.map((s) => s.subgroupCode));
  const defaults = DEFAULT_SUBGROUPS_BY_SYSTEM[profile.systemId] ?? [];
  for (const def of defaults) {
    if (!dbCodes.has(def.subgroupCode)) {
      fromDb.push({
        id: def.id,
        systemId: def.systemId,
        parentGroupCode: def.parentGroupCode,
        subgroupCode: def.subgroupCode,
        displayNameEs: def.displayNameEs,
        choG: def.choG,
        proG: def.proG,
        fatG: def.fatG,
        kcalTarget: def.kcalTarget,
        sortOrder: def.sortOrder,
      });
    }
  }

  return fromDb.sort((a, b) => a.sortOrder - b.sortOrder);
};

const buildPoliciesFromDb = (
  profile: PatientProfile,
  dbPolicies: Awaited<ReturnType<typeof prisma.subgroupSelectionPolicy.findMany>>,
): SubgroupSelectionPolicy[] => {
  const fromDb: SubgroupSelectionPolicy[] = dbPolicies.map((policy) => ({
    goal: policy.goal as Goal,
    dietPattern: policy.dietPattern as DietPattern | 'any',
    subgroupCode: policy.subgroupCode as ExchangeSubgroupCode,
    targetSharePct: Number(policy.targetSharePct),
    scoreAdjustment: Number(policy.scoreAdjustment),
  }));

  // Merge: DB entries take precedence, fill missing from defaults
  const dbKeys = new Set(fromDb.map((p) => `${p.goal}|${p.dietPattern}|${p.subgroupCode}`));
  const defaults = DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM[profile.systemId] ?? [];
  for (const def of defaults) {
    const key = `${def.goal}|${def.dietPattern}|${def.subgroupCode}`;
    if (!dbKeys.has(key)) {
      fromDb.push({
        goal: def.goal as Goal,
        dietPattern: def.dietPattern as DietPattern | 'any',
        subgroupCode: def.subgroupCode,
        targetSharePct: def.targetSharePct,
        scoreAdjustment: def.scoreAdjustment,
      });
    }
  }

  return fromDb;
};

const selectPolicies = (
  policies: SubgroupSelectionPolicy[],
  goal: Goal,
  dietPattern: DietPattern,
): SubgroupSelectionPolicy[] => {
  const byGoal = policies.filter((item) => item.goal === goal);
  const exact = byGoal.filter((item) => item.dietPattern === dietPattern);
  if (exact.length > 0) return exact;

  const fallback = byGoal.filter((item) => item.dietPattern === 'any');
  return fallback;
};

const distributeSubgroupExchanges = (
  totalExchanges: number,
  allPolicies: SubgroupSelectionPolicy[],
): Map<ExchangeSubgroupCode, number> => {
  const result = new Map<ExchangeSubgroupCode, number>();

  // Ensure all policy codes appear in the result (including those with 0)
  for (const p of allPolicies) {
    result.set(p.subgroupCode, 0);
  }

  // Filter to active policies only (targetSharePct > 0)
  const activePolicies = allPolicies.filter((p) => p.targetSharePct > 0);
  if (totalExchanges <= 0 || activePolicies.length === 0) return result;

  const totalShare = activePolicies.reduce((acc, item) => acc + item.targetSharePct, 0);
  const normalizedPolicies =
    totalShare > 0
      ? activePolicies.map((item) => ({
        ...item,
        normalizedShare: item.targetSharePct / totalShare,
      }))
      : activePolicies.map((item) => ({ ...item, normalizedShare: 1 / activePolicies.length }));

  for (const policy of normalizedPolicies) {
    result.set(policy.subgroupCode, roundHalf(totalExchanges * policy.normalizedShare));
  }

  let current = Array.from(result.values()).reduce((acc, value) => acc + value, 0);
  let diff = roundHalf(totalExchanges - current);

  const priorityOrder = [...normalizedPolicies].sort((a, b) => b.normalizedShare - a.normalizedShare);

  while (Math.abs(diff) >= 0.5) {
    for (const policy of priorityOrder) {
      if (Math.abs(diff) < 0.5) break;

      const key = policy.subgroupCode;
      const currentValue = result.get(key) ?? 0;

      if (diff > 0) {
        result.set(key, currentValue + 0.5);
        diff = roundHalf(diff - 0.5);
      } else if (currentValue > 0) {
        result.set(key, Math.max(0, currentValue - 0.5));
        diff = roundHalf(diff + 0.5);
      }
    }

    const updated = Array.from(result.values()).reduce((acc, value) => acc + value, 0);
    if (updated === current) break;
    current = updated;
  }

  return result;
};

const buildMxSmaeGroupPlan = (
  profile: PatientProfile,
  targets: EquivalentPlanResponse['targets'],
  groups: GroupDefinition[],
  subgroups: SubgroupDefinition[],
  policies: SubgroupSelectionPolicy[],
): {
  groupPlan: EquivalentGroupPlan[];
  subgroupPlan: EquivalentGroupPlan[];
  subgroupScoreAdjustments: Record<string, number>;
} => {
  const groupByCode = new Map(groups.map((item) => [item.groupCode, item]));
  const subgroupByCode = new Map(subgroups.map((item) => [item.subgroupCode, item]));

  const requiredCodes = ['vegetable', 'fruit', 'carb', 'legume', 'fat', 'protein'];
  for (const code of requiredCodes) {
    if (!groupByCode.has(code)) {
      throw new Error(`Missing MX group definition: ${code}`);
    }
  }

  const aoaCodes: ExchangeSubgroupCode[] = [
    'aoa_muy_bajo_grasa',
    'aoa_bajo_grasa',
    'aoa_moderado_grasa',
    'aoa_alto_grasa',
  ];

  const cerealCodes: ExchangeSubgroupCode[] = [
    'cereal_sin_grasa',
    'cereal_con_grasa',
  ];

  const lecheCodes: ExchangeSubgroupCode[] = [
    'leche_descremada',
    'leche_semidescremada',
    'leche_entera',
    'leche_con_azucar',
  ];

  const azucarCodes: ExchangeSubgroupCode[] = [
    'azucar_sin_grasa',
    'azucar_con_grasa',
  ];

  const grasaCodes: ExchangeSubgroupCode[] = [
    'grasa_sin_proteina',
    'grasa_con_proteina',
  ];

  for (const code of aoaCodes) {
    if (!subgroupByCode.has(code)) {
      throw new Error(`Missing MX subgroup definition: ${code}`);
    }
  }

  let remainingCho = targets.carbsG;
  let remainingPro = targets.proteinG;
  let remainingFat = targets.fatG;

  const counts = new Map<string, number>();

  const setCount = (code: string, exchanges: number): void => {
    const group = groupByCode.get(code);
    const subgroup = subgroupByCode.get(code as ExchangeSubgroupCode);

    if (group) {
      counts.set(code, exchanges);
      const used = contribution(exchanges, group);
      remainingCho -= used.choG;
      remainingPro -= used.proG;
      remainingFat -= used.fatG;
      return;
    }

    if (subgroup) {
      counts.set(code, exchanges);
      const used = contribution(exchanges, subgroup);
      remainingCho -= used.choG;
      remainingPro -= used.proG;
      remainingFat -= used.fatG;
    }
  };

  // --- Verduras (goal-sensitive) ---
  // lose_fat: more vegetables to increase volume with low calories
  // gain_muscle: fewer vegetables, reserve macro space for protein/carbs
  const vegGoalMap: Record<string, number> = {
    lose_fat: 4,
    maintain: 3,
    gain_muscle: 2,
  };
  setCount('vegetable', vegGoalMap[profile.goal] ?? 3);

  // --- Frutas (goal-sensitive) ---
  // lose_fat: moderate fruit, avoid excess sugar
  // gain_muscle: more fruit for quick carbs
  const fruitGoalMap: Record<string, number> = {
    lose_fat: 1.5,
    maintain: 2,
    gain_muscle: 3,
  };
  setCount('fruit', fruitGoalMap[profile.goal] ?? 2);

  // --- Legumes (goal + diet-pattern sensitive) ---
  const legume = groupByCode.get('legume');
  if (legume) {
    let legumeExchanges: number;
    if (profile.dietPattern === 'vegan') {
      legumeExchanges = roundHalf(Math.max(2, remainingPro / Math.max(legume.proG, 1)));
      legumeExchanges = clamp(legumeExchanges, 2, 8);
    } else if (profile.dietPattern === 'vegetarian') {
      legumeExchanges = roundHalf(clamp((remainingPro * 0.3) / Math.max(legume.proG, 1), 1.5, 4));
    } else {
      const legumeGoalMap: Record<string, number> = {
        lose_fat: 0.5,
        maintain: 1,
        gain_muscle: 1.5,
      };
      legumeExchanges = legumeGoalMap[profile.goal] ?? 1;
    }

    setCount('legume', legumeExchanges);
  }

  const activePolicies = selectPolicies(policies, profile.goal, profile.dietPattern);

  // ── Context-aware macro budgets (goal-sensitive) ──
  // Snapshot after fixed groups + legumes
  const totalRemainingPro = Math.max(0, remainingPro);
  const totalRemainingCho = Math.max(0, remainingCho);
  const totalRemainingFat = Math.max(0, remainingFat);
  const goal = profile.goal;

  // Milk: amount depends on goal
  const milkDef = groupByCode.get('milk');
  const milkMinMax: Record<string, [number, number]> = {
    lose_fat: [0.5, 1],    // just 1 serving of descremada
    maintain: [1, 2],    // moderate
    gain_muscle: [1, 3],    // more allowed
  };
  const [milkMin, milkMax] = milkMinMax[goal] ?? [1, 2];
  const milkTarget = milkDef
    ? roundHalf(clamp(totalRemainingPro * 0.12 / Math.max(milkDef.proG, 1), milkMin, milkMax))
    : 0;

  // Sugar: 0 for lose_fat, modest for others
  const sugarDef = groupByCode.get('sugar');
  let sugarTarget = 0;
  if (sugarDef && goal !== 'lose_fat') {
    sugarTarget = roundHalf(
      clamp(totalRemainingCho * 0.05 / Math.max(sugarDef.choG, 1), 0.5, 2),
    );
  }

  // AOA: remaining protein after milk reservation
  const proteinDef = groupByCode.get('protein');
  const proForAoa = Math.max(0, totalRemainingPro - milkTarget * (milkDef?.proG ?? 0));
  const aoaTotalExchanges =
    profile.dietPattern === 'vegan' || !proteinDef
      ? 0
      : roundHalf(Math.max(0, proForAoa / Math.max(proteinDef.proG, 1)));

  // Cereals: remaining CHO after sugar reservation
  const carbDef = groupByCode.get('carb');
  const choForCereal = Math.max(0, totalRemainingCho - sugarTarget * (sugarDef?.choG ?? 0));
  const cerealTarget = carbDef
    ? roundHalf(Math.max(0, choForCereal / Math.max(carbDef.choG, 1)))
    : 0;

  // Fat (grasas): total fat minus estimated fat from other groups
  const fatFromAoa = aoaTotalExchanges * (proteinDef?.fatG ?? 3);
  const fatFromMilk = milkTarget * (milkDef?.fatG ?? 4);
  const fatFromCereal = cerealTarget * (carbDef?.fatG ?? 0);
  const fatDef = groupByCode.get('fat');
  const fatForGrasas = Math.max(0, totalRemainingFat - fatFromAoa - fatFromMilk - fatFromCereal);
  const grasaTarget = fatDef
    ? roundHalf(Math.max(0, fatForGrasas / Math.max(fatDef.fatG, 1)))
    : 0;

  // ── Now distribute exchanges into subgroups and apply setCount ──

  // --- AOA (protein) subgroups ---
  const aoaPolicies = activePolicies.filter((p) => aoaCodes.includes(p.subgroupCode));
  const distributedAoa = distributeSubgroupExchanges(aoaTotalExchanges, aoaPolicies);

  for (const code of aoaCodes) {
    const value = profile.dietPattern === 'vegan' ? 0 : distributedAoa.get(code) ?? 0;
    setCount(code, value);
  }

  // --- Milk subgroups ---
  if (milkDef && milkTarget > 0) {
    const milkPolicies = activePolicies.filter((p) => lecheCodes.includes(p.subgroupCode));
    if (milkPolicies.length > 0) {
      const distributedMilk = distributeSubgroupExchanges(milkTarget, milkPolicies);
      for (const code of lecheCodes) {
        setCount(code, distributedMilk.get(code) ?? 0);
      }
    } else {
      setCount('milk', milkTarget);
    }
  }

  // --- Cereales (carb) subgroups ---
  if (carbDef && cerealTarget > 0) {
    const cerealPolicies = activePolicies.filter((p) => cerealCodes.includes(p.subgroupCode));
    if (cerealPolicies.length > 0) {
      const distributedCereal = distributeSubgroupExchanges(cerealTarget, cerealPolicies);
      for (const code of cerealCodes) {
        setCount(code, distributedCereal.get(code) ?? 0);
      }
    } else {
      setCount('carb', cerealTarget);
    }
  }

  // --- Fat subgroups ---
  if (fatDef && grasaTarget > 0) {
    const grasaPolicies = activePolicies.filter((p) => grasaCodes.includes(p.subgroupCode));
    if (grasaPolicies.length > 0) {
      const distributedGrasa = distributeSubgroupExchanges(grasaTarget, grasaPolicies);
      for (const code of grasaCodes) {
        setCount(code, distributedGrasa.get(code) ?? 0);
      }
    } else {
      setCount('fat', grasaTarget);
    }
  }

  // --- Azúcares (sugar) subgroups ---
  if (sugarDef && sugarTarget > 0) {
    const azucarPolicies = activePolicies.filter((p) => azucarCodes.includes(p.subgroupCode));
    if (azucarPolicies.length > 0) {
      const distributedAzucar = distributeSubgroupExchanges(sugarTarget, azucarPolicies);
      for (const code of azucarCodes) {
        setCount(code, distributedAzucar.get(code) ?? 0);
      }
    } else {
      setCount('sugar', sugarTarget);
    }
  }

  // --- Build output rows ---
  const rowByCode = new Map<string, EquivalentGroupPlan>();

  for (const code of MX_OUTPUT_ORDER) {
    const subgroup = subgroupByCode.get(code as ExchangeSubgroupCode);
    if (subgroup) {
      const exchanges = counts.get(code) ?? 0;
      const totals = contribution(exchanges, subgroup);
      rowByCode.set(code, {
        groupCode: code,
        groupName: subgroup.displayNameEs,
        exchangesPerDay: exchanges,
        ...totals,
      });
      continue;
    }

    const group = groupByCode.get(code);
    if (group) {
      const exchanges = counts.get(code) ?? 0;
      const totals = contribution(exchanges, group);
      rowByCode.set(code, {
        groupCode: code,
        groupName: group.displayNameEs,
        exchangesPerDay: exchanges,
        ...totals,
      });
    }
  }

  const groupPlan = MX_OUTPUT_ORDER.map((code) => rowByCode.get(code)).filter(
    (item): item is EquivalentGroupPlan => Boolean(item),
  );

  const allSubgroupCodes: ExchangeSubgroupCode[] = [
    ...aoaCodes,
    ...cerealCodes,
    ...lecheCodes,
    ...azucarCodes,
    ...grasaCodes,
  ];

  const subgroupPlan = allSubgroupCodes
    .map((code) => rowByCode.get(code))
    .filter((item): item is EquivalentGroupPlan => Boolean(item));

  const subgroupScoreAdjustments = activePolicies.reduce<Record<string, number>>((acc, policy) => {
    acc[policy.subgroupCode] = policy.scoreAdjustment;
    return acc;
  }, {});

  if (profile.goal === 'lose_fat') {
    subgroupScoreAdjustments.aoa_moderado_grasa =
      subgroupScoreAdjustments.aoa_moderado_grasa ?? -6;
    subgroupScoreAdjustments.aoa_alto_grasa = subgroupScoreAdjustments.aoa_alto_grasa ?? -12;
  }

  if (profile.goal === 'gain_muscle') {
    subgroupScoreAdjustments.aoa_moderado_grasa =
      subgroupScoreAdjustments.aoa_moderado_grasa ?? 4;
  }

  if (profile.dietPattern === 'vegetarian') {
    subgroupScoreAdjustments.aoa_alto_grasa =
      (subgroupScoreAdjustments.aoa_alto_grasa ?? 0) - 6;
  }

  if (profile.dietPattern === 'vegan') {
    subgroupScoreAdjustments.aoa_muy_bajo_grasa = -100;
    subgroupScoreAdjustments.aoa_bajo_grasa = -100;
    subgroupScoreAdjustments.aoa_moderado_grasa = -100;
    subgroupScoreAdjustments.aoa_alto_grasa = -100;
    subgroupScoreAdjustments.legume = (subgroupScoreAdjustments.legume ?? 0) + 12;
  }

  return {
    groupPlan,
    subgroupPlan,
    subgroupScoreAdjustments,
  };
};

export const generateEquivalentPlan = async (
  cid: string,
  profile: PatientProfile,
): Promise<EquivalentPlanResponse> => {
  const targets = calculateEnergyTargets(profile);

  const [dbGroups, dbSubgroups, dbPolicies] = await Promise.all([
    prisma.exchangeGroup.findMany({
      where: { systemId: profile.systemId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.exchangeSubgroup.findMany({
      where: {
        systemId: profile.systemId,
        isActive: true,
      },
      include: { parentGroup: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.subgroupSelectionPolicy.findMany({
      where: {
        systemId: profile.systemId,
        isActive: true,
      },
      orderBy: [{ goal: 'asc' }, { dietPattern: 'asc' }, { subgroupCode: 'asc' }],
    }),
  ]);

  const groupDefinitions = buildDefinitionsFromDb(profile, dbGroups);
  const subgroupDefinitions = buildSubgroupsFromDb(profile, dbSubgroups);
  const subgroupPolicies = buildPoliciesFromDb(profile, dbPolicies);

  const useMxAdvancedFlow =
    isSmaeSubgroupsEnabled &&
    profile.systemId === 'mx_smae' &&
    subgroupDefinitions.length > 0;

  const advancedResult = useMxAdvancedFlow
    ? buildMxSmaeGroupPlan(profile, targets, groupDefinitions, subgroupDefinitions, subgroupPolicies)
    : null;

  const groupPlan =
    advancedResult?.groupPlan ??
    buildEquivalentPlan(
      targets,
      groupDefinitions.map((group) => ({
        id: group.id,
        systemId: group.systemId,
        groupCode: group.groupCode as any,
        displayNameEs: group.displayNameEs,
        choG: group.choG,
        proG: group.proG,
        fatG: group.fatG,
        kcalTarget: group.kcalTarget,
        sortOrder: group.sortOrder,
      })),
    );

  const { foods } = await loadFoodsForSystem(profile);
  const rankOptions = advancedResult?.subgroupScoreAdjustments
    ? { subgroupScoreAdjustments: advancedResult.subgroupScoreAdjustments }
    : undefined;
  const rankedFoods = rankFoods(foods, profile, rankOptions);

  const topFoodsByGroupDynamic = groupTopFoods(rankedFoods, 6);
  const topFoodsByGroup: EquivalentPlanResponse['topFoodsByGroup'] = {
    ...topFoodsByGroupDynamic,
  };

  for (const row of groupPlan) {
    if (!topFoodsByGroup[row.groupCode]) {
      topFoodsByGroup[row.groupCode] = [];
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
        groupPlan,
        subgroupPlan: advancedResult?.subgroupPlan ?? [],
      },
    },
  });

  const topRecommendations = groupPlan.flatMap((row) =>
    (topFoodsByGroup[row.groupCode] ?? []).slice(0, 6).map((food) => ({
      planId: persistedPlan.id,
      foodId: food.id,
      groupCode: row.groupCode,
      rankScore: food.score,
      reasons: food.reasons,
      isExtended: false,
    })),
  );

  const extendedRecommendations = extendedFoods.map((food) => ({
    planId: persistedPlan.id,
    foodId: food.id,
    groupCode: (food.subgroupCode ?? food.groupCode) as string,
    rankScore: food.score,
    reasons: food.reasons,
    isExtended: true,
  }));

  await prisma.generatedPlanRecommendation.createMany({
    data: [...topRecommendations, ...extendedRecommendations],
  });

  // Compute meal distribution
  const mealDistribution = distributeMeals(groupPlan, profile);

  return {
    profile,
    targets,
    groupPlan,
    ...(advancedResult ? { subgroupPlan: advancedResult.subgroupPlan } : {}),
    topFoodsByGroup,
    extendedFoods,
    mealDistribution,
  };
};
