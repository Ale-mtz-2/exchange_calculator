import { describe, expect, it } from 'vitest';

import type { EquivalentBucketCatalogItem, EquivalentBucketPlanV2 } from '@equivalentes/shared';

import {
  buildEditableBucketRows,
  buildEffectiveEditableBucketRows,
  buildBaseExchangesByBucket,
  buildBucketRowIndex,
  canIncrease,
} from './bucketPlanDynamic';
import { buildBucketLabelIndex, resolveFoodBucketLabel } from './bucketLabels';

const bucketCatalog: EquivalentBucketCatalogItem[] = [
  {
    bucketType: 'group',
    bucketId: 6,
    bucketKey: 'group:6',
    bucketName: 'Leche',
    legacyCode: 'milk',
    choPerExchange: 12,
    proPerExchange: 9,
    fatPerExchange: 4,
    kcalPerExchange: 110,
  },
  {
    bucketType: 'group',
    bucketId: 8,
    bucketKey: 'group:8',
    bucketName: 'Cereales',
    legacyCode: 'carb',
    choPerExchange: 15,
    proPerExchange: 2,
    fatPerExchange: 0,
    kcalPerExchange: 70,
  },
  {
    bucketType: 'subgroup',
    bucketId: 7,
    bucketKey: 'subgroup:7',
    bucketName: 'Descremada',
    parentGroupId: 6,
    parentGroupName: 'Leche',
    legacyCode: 'leche_descremada',
    choPerExchange: 12,
    proPerExchange: 9,
    fatPerExchange: 2,
    kcalPerExchange: 95,
  },
];

const bucketPlan: EquivalentBucketPlanV2[] = [
  {
    bucketType: 'group',
    bucketId: 6,
    bucketKey: 'group:6',
    bucketName: 'Leche',
    legacyCode: 'milk',
    exchangesPerDay: 2,
    choG: 24,
    proG: 18,
    fatG: 8,
    kcal: 220,
  },
];

describe('buildEditableBucketRows', () => {
  it('adds missing buckets from catalog with zero base exchanges', () => {
    const rows = buildEditableBucketRows(bucketCatalog, bucketPlan, {});
    const index = buildBucketRowIndex(rows);

    expect(index.get('group:8')?.baseExchanges).toBe(0);
    expect(index.get('group:8')?.exchangesPerDay).toBe(0);
    expect(index.get('subgroup:7')?.baseExchanges).toBe(0);
  });

  it('keeps group-first ordering and subgroup after parent group', () => {
    const rows = buildEditableBucketRows(bucketCatalog, bucketPlan, {});
    const keys = rows.map((row) => row.bucketKey);

    expect(keys).toEqual(['group:6', 'group:8', 'subgroup:7']);
  });

  it('supports positive increase on bucket that starts at zero when profile exists', () => {
    const rows = buildEditableBucketRows(bucketCatalog, bucketPlan, {});
    const index = buildBucketRowIndex(rows);
    const base = buildBaseExchangesByBucket(rows);

    expect(base.get('group:8')).toBe(0);
    expect(canIncrease(index.get('group:8')!)).toBe(true);
  });
});

describe('buildEffectiveEditableBucketRows', () => {
  it('removes parent group rows when subgroup rows exist for the same parent', () => {
    const rows = buildEditableBucketRows(bucketCatalog, bucketPlan, {});
    const effective = buildEffectiveEditableBucketRows(rows);

    expect(effective.map((row) => row.bucketKey)).toEqual(['group:8', 'subgroup:7']);
  });

  it('keeps groups when no subgroup exists for that parent', () => {
    const rows = buildEditableBucketRows(
      bucketCatalog.filter((bucket) => bucket.bucketType === 'group'),
      bucketPlan,
      {},
    );
    const effective = buildEffectiveEditableBucketRows(rows);

    expect(effective.map((row) => row.bucketKey)).toEqual(['group:6', 'group:8']);
  });
});

describe('bucket labels', () => {
  it('builds subgroup labels as "Subgrupo > Grupo"', () => {
    const labels = buildBucketLabelIndex(bucketCatalog);
    const label = resolveFoodBucketLabel({ bucketKey: 'subgroup:7' }, labels);

    expect(label).toBe('Descremada > Leche');
  });

  it('removes parent redundancy from subgroup label', () => {
    const labels = buildBucketLabelIndex([
      {
        bucketType: 'group',
        bucketId: 13,
        bucketKey: 'group:13',
        bucketName: 'Azúcares',
        choPerExchange: 10,
        proPerExchange: 0,
        fatPerExchange: 0,
        kcalPerExchange: 40,
      },
      {
        bucketType: 'subgroup',
        bucketId: 25,
        bucketKey: 'subgroup:25',
        bucketName: 'Azucares con grasa',
        parentGroupId: 13,
        parentGroupName: 'Azúcares',
        choPerExchange: 5,
        proPerExchange: 0,
        fatPerExchange: 5,
        kcalPerExchange: 65,
      },
    ]);

    expect(resolveFoodBucketLabel({ bucketKey: 'subgroup:25' }, labels)).toBe('Con grasa > Azúcares');
  });

  it('preserves subgroup text when parent words are not a strict prefix', () => {
    const labels = buildBucketLabelIndex([
      {
        bucketType: 'group',
        bucketId: 12,
        bucketKey: 'group:12',
        bucketName: 'Aceites y grasas',
        choPerExchange: 0,
        proPerExchange: 0,
        fatPerExchange: 5,
        kcalPerExchange: 45,
      },
      {
        bucketType: 'subgroup',
        bucketId: 26,
        bucketKey: 'subgroup:26',
        bucketName: 'Grasas con proteina',
        parentGroupId: 12,
        parentGroupName: 'Aceites y grasas',
        choPerExchange: 0,
        proPerExchange: 3,
        fatPerExchange: 5,
        kcalPerExchange: 55,
      },
    ]);

    expect(resolveFoodBucketLabel({ bucketKey: 'subgroup:26' }, labels)).toBe(
      'Grasas con proteina > Aceites y grasas',
    );
  });

  it('keeps group label when no parent exists', () => {
    const labels = buildBucketLabelIndex([
      {
        bucketType: 'group',
        bucketId: 6,
        bucketKey: 'group:6',
        bucketName: 'Leche',
        choPerExchange: 12,
        proPerExchange: 9,
        fatPerExchange: 4,
        kcalPerExchange: 110,
      },
    ]);

    expect(resolveFoodBucketLabel({ bucketKey: 'group:6' }, labels)).toBe('Leche');
  });
});
