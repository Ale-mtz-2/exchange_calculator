import type { ExchangeGroupCode, ExchangeSubgroupCode } from '@equivalentes/shared';

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

export const inferSubgroupCodeFromText = (
  value: string | null | undefined,
  parentGroupCode?: ExchangeGroupCode,
): ExchangeSubgroupCode | undefined => {
  const text = normalizeForGroupMatching(value);
  if (!text) return undefined;

  if (parentGroupCode === 'protein') {
    if (text.includes('muy bajo') && text.includes('grasa')) return 'aoa_muy_bajo_grasa';
    if (text.includes('bajo') && text.includes('grasa')) return 'aoa_bajo_grasa';
    if (text.includes('moderado') && text.includes('grasa')) return 'aoa_moderado_grasa';
    if (text.includes('alto') && text.includes('grasa')) return 'aoa_alto_grasa';
  }

  if (parentGroupCode === 'milk') {
    if (text.includes('semidescremada')) return 'leche_semidescremada';
    if (text.includes('descremada')) return 'leche_descremada';
    if (text.includes('entera')) return 'leche_entera';
    if (text.includes('azucar')) return 'leche_con_azucar';
  }

  if (parentGroupCode === 'fat') {
    if (text.includes('sin proteina')) return 'grasa_sin_proteina';
    if (text.includes('con proteina')) return 'grasa_con_proteina';
  }

  if (text.includes('sin grasa')) {
    if (parentGroupCode === 'sugar') return 'azucar_sin_grasa';
    if (parentGroupCode === 'carb') return 'cereal_sin_grasa';
  }

  if (text.includes('con grasa')) {
    if (parentGroupCode === 'sugar') return 'azucar_con_grasa';
    if (parentGroupCode === 'carb') return 'cereal_con_grasa';
  }

  return undefined;
};
