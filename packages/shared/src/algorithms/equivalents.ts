import type { ExchangeGroupDefinition } from '../catalog/systems';
import type { EnergyTargets, EquivalentGroupPlan } from '../types';

const FIXED_GROUP_EXCHANGES: Record<string, number> = {
  vegetable: 3,
  fruit: 2,
};

const roundHalf = (value: number): number => Math.max(0, Math.round(value * 2) / 2);

const contribution = (count: number, group: ExchangeGroupDefinition) => ({
  choG: count * group.choG,
  proG: count * group.proG,
  fatG: count * group.fatG,
  kcal: count * group.kcalTarget,
});

const normalizeGroupCode = (code: string): string => {
  const normalized = code.toLowerCase();

  if (normalized.includes('veg')) return 'vegetable';
  if (normalized.includes('fruit') || normalized.includes('fruta')) return 'fruit';
  if (normalized.includes('legum')) return 'legume';
  if (normalized.includes('fat') || normalized.includes('grasa')) return 'fat';
  if (normalized.includes('protein') || normalized.includes('prote') || normalized.includes('animal')) {
    return 'protein';
  }

  return 'carb';
};

const estimateExchanges = (
  groupCode: string,
  group: ExchangeGroupDefinition,
  remainingCho: number,
  remainingPro: number,
  remainingFat: number,
): number => {
  if (groupCode === 'protein' && group.proG > 0) {
    return remainingPro / group.proG;
  }

  if (groupCode === 'fat' && group.fatG > 0) {
    return remainingFat / group.fatG;
  }

  if (groupCode === 'legume') {
    const byPro = group.proG > 0 ? remainingPro / group.proG : Number.POSITIVE_INFINITY;
    const byCho = group.choG > 0 ? remainingCho / group.choG : Number.POSITIVE_INFINITY;
    return Math.min(byPro, byCho);
  }

  if (group.choG > 0) {
    return remainingCho / group.choG;
  }

  if (group.proG > 0) {
    return remainingPro / group.proG;
  }

  if (group.fatG > 0) {
    return remainingFat / group.fatG;
  }

  return 0;
};

export const parseEquivalentQuantity = (input: string | number): number => {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0;
    return roundHalf(input);
  }

  const normalized = input.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return roundHalf(parsed);
};

export const buildEquivalentPlan = (
  targets: EnergyTargets,
  groups: ExchangeGroupDefinition[],
): EquivalentGroupPlan[] => {
  const sortedGroups = [...groups]
    .map((group) => ({ ...group, normalizedCode: normalizeGroupCode(group.groupCode) }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  let remainingCho = targets.carbsG;
  let remainingPro = targets.proteinG;
  let remainingFat = targets.fatG;

  const counts = new Map<number, number>();

  for (const group of sortedGroups) {
    const fixed = FIXED_GROUP_EXCHANGES[group.normalizedCode];
    if (fixed === undefined) continue;

    counts.set(group.id, fixed);
    const used = contribution(fixed, group);
    remainingCho -= used.choG;
    remainingPro -= used.proG;
    remainingFat -= used.fatG;
  }

  for (const group of sortedGroups) {
    if (counts.has(group.id)) continue;

    const rawCount = estimateExchanges(group.normalizedCode, group, remainingCho, remainingPro, remainingFat);
    const rounded = roundHalf(rawCount);
    counts.set(group.id, rounded);

    const used = contribution(rounded, group);
    remainingCho -= used.choG;
    remainingPro -= used.proG;
    remainingFat -= used.fatG;
  }

  return sortedGroups.map((group) => {
    const exchangesPerDay = counts.get(group.id) ?? 0;
    const totals = contribution(exchangesPerDay, group);

    return {
      groupCode: group.normalizedCode,
      groupName: group.displayNameEs,
      exchangesPerDay,
      ...totals,
    };
  });
};
