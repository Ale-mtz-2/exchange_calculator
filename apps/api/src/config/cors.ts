const TRAILING_SLASHES = /\/+$/;

export const normalizeOrigin = (origin: string): string => origin.trim().replace(TRAILING_SLASHES, '');

const parseCsvOrigins = (csv: string): string[] =>
  csv
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter((value) => value.length > 0);

export const parseAllowedOrigins = (options: {
  webOrigin: string;
  webOriginsCsv?: string;
}): Set<string> => {
  const normalizedWebOriginsCsv = options.webOriginsCsv?.trim();
  const csvOrigins = normalizedWebOriginsCsv ? parseCsvOrigins(normalizedWebOriginsCsv) : [];
  const origins = csvOrigins.length > 0 ? csvOrigins : [normalizeOrigin(options.webOrigin)];

  return new Set(origins);
};

export const isOriginAllowed = (origin: string | undefined, allowedOrigins: Set<string>): boolean => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.has(normalizeOrigin(origin));
};
