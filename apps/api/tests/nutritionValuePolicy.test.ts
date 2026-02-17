import { describe, expect, it } from 'vitest';

import { buildSourcePreferenceOrderSql, sourcePreferenceScore } from '../src/services/nutritionValuePolicy.js';

describe('nutritionValuePolicy', () => {
  it('prioritizes SMAE sources for mx_smae', () => {
    const smaeScore = sourcePreferenceScore('mx_smae', 'SMAE (Mexico)');
    const usdaScore = sourcePreferenceScore('mx_smae', 'USDA (USA)');

    expect(smaeScore).toBeLessThan(usdaScore);
  });

  it('prioritizes USDA sources for us_usda', () => {
    const usdaScore = sourcePreferenceScore('us_usda', 'USDA (USA)');
    const smaeScore = sourcePreferenceScore('us_usda', 'SMAE (Mexico)');

    expect(usdaScore).toBeLessThan(smaeScore);
  });

  it('builds deterministic SQL CASE for source ordering', () => {
    const sql = buildSourcePreferenceOrderSql('mx_smae');

    expect(sql).toContain('CASE');
    expect(sql).toContain('ILIKE');
    expect(sql).toContain('ELSE');
  });
});
