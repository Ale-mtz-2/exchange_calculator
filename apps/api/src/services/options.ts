import {
  COUNTRY_OPTIONS,
  COUNTRY_STATES,
  DEFAULT_GROUPS_BY_SYSTEM,
  DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM,
  DEFAULT_SUBGROUPS_BY_SYSTEM,
  EXCHANGE_SYSTEMS,
  KCAL_FORMULAS,
} from '@equivalentes/shared';

import { prisma } from '../db/prisma.js';

export const getOptions = async (): Promise<Record<string, unknown>> => {
  const [dbFormulas, dbSystems, dbGroups, dbSubgroups, dbPolicies, dbStates] = await Promise.all([
    prisma.kcalFormula.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.exchangeSystem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.exchangeGroup.findMany({ orderBy: [{ systemId: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.exchangeSubgroup.findMany({
      where: { isActive: true },
      orderBy: [{ systemId: 'asc' }, { sortOrder: 'asc' }],
      include: { parentGroup: true },
    }),
    prisma.subgroupSelectionPolicy.findMany({
      where: { isActive: true },
      orderBy: [{ systemId: 'asc' }, { goal: 'asc' }, { dietPattern: 'asc' }, { subgroupCode: 'asc' }],
    }),
    prisma.countryState.findMany({ orderBy: [{ countryCode: 'asc' }, { stateName: 'asc' }] }),
  ]);

  const formulas =
    dbFormulas.length > 0
      ? dbFormulas.map((formula) => ({
          id: formula.id,
          name: formula.name,
          description: formula.description,
        }))
      : KCAL_FORMULAS;

  const systems =
    dbSystems.length > 0
      ? dbSystems.map((system) => ({
          id: system.id,
          countryCode: system.countryCode,
          name: system.name,
          source: system.source,
        }))
      : EXCHANGE_SYSTEMS;

  const groupsBySystem =
    dbGroups.length > 0
      ? dbGroups.reduce<Record<string, unknown[]>>((acc, group) => {
          const list = acc[group.systemId] ?? [];
          list.push({
            id: group.id.toString(),
            groupCode: group.groupCode,
            displayNameEs: group.displayNameEs,
            choG: Number(group.choG),
            proG: Number(group.proG),
            fatG: Number(group.fatG),
            kcalTarget: group.kcalTarget,
          });
          acc[group.systemId] = list;
          return acc;
        }, {})
      : DEFAULT_GROUPS_BY_SYSTEM;

  const subgroupsBySystem =
    dbSubgroups.length > 0
      ? dbSubgroups.reduce<Record<string, unknown[]>>((acc, subgroup) => {
          const list = acc[subgroup.systemId] ?? [];
          list.push({
            id: subgroup.id.toString(),
            parentGroupCode: subgroup.parentGroup.groupCode,
            subgroupCode: subgroup.subgroupCode,
            displayNameEs: subgroup.displayNameEs,
            choG: Number(subgroup.choG),
            proG: Number(subgroup.proG),
            fatG: Number(subgroup.fatG),
            kcalTarget: subgroup.kcalTarget,
            sortOrder: subgroup.sortOrder,
          });
          acc[subgroup.systemId] = list;
          return acc;
        }, {})
      : DEFAULT_SUBGROUPS_BY_SYSTEM;

  const subgroupPoliciesBySystem =
    dbPolicies.length > 0
      ? dbPolicies.reduce<Record<string, unknown[]>>((acc, policy) => {
          const list = acc[policy.systemId] ?? [];
          list.push({
            goal: policy.goal,
            dietPattern: policy.dietPattern,
            subgroupCode: policy.subgroupCode,
            targetSharePct: Number(policy.targetSharePct),
            scoreAdjustment: Number(policy.scoreAdjustment),
          });
          acc[policy.systemId] = list;
          return acc;
        }, {})
      : DEFAULT_SUBGROUP_POLICIES_BY_SYSTEM;

  const statesByCountry =
    dbStates.length > 0
      ? dbStates.reduce<Record<string, { code: string; name: string }[]>>((acc, item) => {
          const list = acc[item.countryCode] ?? [];
          list.push({ code: item.stateCode, name: item.stateName });
          acc[item.countryCode] = list;
          return acc;
        }, {})
      : COUNTRY_STATES;

  return {
    countries: COUNTRY_OPTIONS,
    statesByCountry,
    formulas,
    systems,
    groupsBySystem,
    subgroupsBySystem,
    subgroupPoliciesBySystem,
  };
};
