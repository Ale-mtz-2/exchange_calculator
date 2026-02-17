import { describe, expect, it } from 'vitest';

import { inferGroupCodeFromText, normalizeForGroupMatching } from '../src/services/groupCodeMapper.js';

describe('groupCodeMapper', () => {
  it('normalizes diacritics for matching', () => {
    expect(normalizeForGroupMatching('Azúcares')).toBe('azucares');
    expect(normalizeForGroupMatching('Lácteos')).toBe('lacteos');
    expect(normalizeForGroupMatching('Cereales y tubérculos')).toBe('cereales y tuberculos');
  });

  it('maps Azúcares to sugar', () => {
    expect(inferGroupCodeFromText('Azúcares')).toBe('sugar');
  });

  it('maps Azucar without accent to sugar', () => {
    expect(inferGroupCodeFromText('Azucar')).toBe('sugar');
  });

  it('maps Lácteos to milk', () => {
    expect(inferGroupCodeFromText('Lácteos')).toBe('milk');
  });

  it('maps Cereales y tubérculos to carb', () => {
    expect(inferGroupCodeFromText('Cereales y tubérculos')).toBe('carb');
  });

  it('falls back to carb for unknown values', () => {
    expect(inferGroupCodeFromText('Grupo inventado xyz')).toBe('carb');
  });
});
