import type { ExchangeSystemId } from '@equivalentes/shared';

const SOURCE_KEYWORDS_BY_SYSTEM: Record<ExchangeSystemId, string[]> = {
  mx_smae: ['smae', 'mex'],
  us_usda: ['usda', 'usa', 'united states'],
  es_exchange: ['spain', 'espana'],
  ar_exchange: ['argentina', 'arg'],
};

const normalize = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

const escapeSqlLiteral = (value: string): string => value.replace(/'/g, "''");

export const sourcePreferenceScore = (
  systemId: ExchangeSystemId,
  sourceName: string | null | undefined,
): number => {
  const keywords = SOURCE_KEYWORDS_BY_SYSTEM[systemId] ?? [];
  const normalized = normalize(sourceName);
  if (!normalized) return keywords.length;

  for (let index = 0; index < keywords.length; index += 1) {
    const keyword = keywords[index];
    if (keyword && normalized.includes(keyword)) {
      return index;
    }
  }

  return keywords.length;
};

export const buildSourcePreferenceOrderSql = (
  systemId: ExchangeSystemId,
  sourceNameExpr = "COALESCE(src.name, '')",
): string => {
  const keywords = SOURCE_KEYWORDS_BY_SYSTEM[systemId] ?? [];
  if (keywords.length === 0) return '0';

  const cases = keywords
    .map((keyword, index) => `WHEN ${sourceNameExpr} ILIKE '%${escapeSqlLiteral(keyword)}%' THEN ${index}`)
    .join('\n            ');

  return `CASE
            ${cases}
            ELSE ${keywords.length}
          END`;
};
