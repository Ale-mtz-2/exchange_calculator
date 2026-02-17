import type { ExchangeGroupCode } from '@equivalentes/shared';

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

/**
 * Normalizes free-text labels (DB group/category names) for robust keyword matching.
 * It lowercases and removes diacritics so accented labels still match.
 */
export const normalizeForGroupMatching = (value: string | null | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

export const inferGroupCodeFromText = (value: string | null | undefined): ExchangeGroupCode => {
  const text = normalizeForGroupMatching(value);

  if (text.includes('verdura') || text.includes('vegetable')) return 'vegetable';
  if (text.includes('fruta') || text.includes('fruit')) return 'fruit';
  if (text.includes('legum')) return 'legume';
  if (text.includes('leche') || text.includes('milk') || text.includes('lacteo') || text.includes('dairy'))
    return 'milk';
  if (text.includes('azucar') || text.includes('sugar') || text.includes('dulce') || text.includes('sweet'))
    return 'sugar';
  if (text.includes('grasa') || text.includes('fat') || text.includes('aceite') || text.includes('oil'))
    return 'fat';
  if (text.includes('prote') || text.includes('animal') || text.includes('protein')) return 'protein';

  return 'carb';
};