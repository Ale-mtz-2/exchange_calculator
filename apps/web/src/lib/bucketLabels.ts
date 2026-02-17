import type { EquivalentBucketCatalogItem } from '@equivalentes/shared';

export type BucketLabelInfo = {
  label: string;
  bucketName: string;
  parentName?: string;
};

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

const normalizeLabelToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

const toTitleStart = (value: string): string =>
  value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;

const stripParentRedundancy = (subgroupName: string, parentName: string): string => {
  const subgroupWords = subgroupName.trim().split(/\s+/).filter(Boolean);
  const parentWords = parentName.trim().split(/\s+/).filter(Boolean);

  if (subgroupWords.length <= parentWords.length || parentWords.length === 0) {
    return subgroupName;
  }

  const subgroupHead = subgroupWords.slice(0, parentWords.length).join(' ');
  if (normalizeLabelToken(subgroupHead) !== normalizeLabelToken(parentName)) {
    return subgroupName;
  }

  const remainder = subgroupWords.slice(parentWords.length).join(' ').trim();
  if (!remainder) {
    return subgroupName;
  }

  return toTitleStart(remainder);
};

export const buildBucketLabelIndex = (
  bucketCatalog: EquivalentBucketCatalogItem[],
): Map<string, BucketLabelInfo> => {
  const groupNameById = new Map<number, string>();
  for (const bucket of bucketCatalog) {
    if (bucket.bucketType === 'group') {
      groupNameById.set(bucket.bucketId, bucket.bucketName);
    }
  }

  const index = new Map<string, BucketLabelInfo>();
  for (const bucket of bucketCatalog) {
    const parentName = bucket.bucketType === 'subgroup'
      ? (bucket.parentGroupName ?? (typeof bucket.parentGroupId === 'number'
        ? groupNameById.get(bucket.parentGroupId)
        : undefined))
      : undefined;
    const subgroupDisplayName = parentName
      ? stripParentRedundancy(bucket.bucketName, parentName)
      : bucket.bucketName;
    const label = parentName
      ? `${subgroupDisplayName} > ${parentName}`
      : bucket.bucketName;

    index.set(bucket.bucketKey, {
      label,
      bucketName: bucket.bucketName,
      ...(parentName ? { parentName } : {}),
    });
  }

  return index;
};

type FoodBucketLike = {
  bucketKey?: string;
  subgroupCode?: string;
  groupCode?: string;
};

export const resolveFoodBucketLabel = (
  food: FoodBucketLike,
  bucketLabelIndex: Map<string, BucketLabelInfo>,
): string => {
  if (food.bucketKey) {
    const byBucketKey = bucketLabelIndex.get(food.bucketKey);
    if (byBucketKey) return byBucketKey.label;
  }

  if (food.subgroupCode) {
    const bySubgroup = bucketLabelIndex.get(food.subgroupCode);
    if (bySubgroup) return bySubgroup.label;
  }

  if (food.groupCode) {
    const byGroup = bucketLabelIndex.get(food.groupCode);
    if (byGroup) return byGroup.label;
  }

  return food.bucketKey ?? food.subgroupCode ?? food.groupCode ?? 'Sin bucket';
};
