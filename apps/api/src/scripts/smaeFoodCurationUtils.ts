import type { ExchangeGroupCode, ExchangeSubgroupCode } from '@equivalentes/shared';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../config/env.js';
import { nutritionPool } from '../db/pg.js';
import { inferGroupCodeFromText, inferSubgroupCodeFromText } from '../services/groupCodeMapper.js';
import { safeSchema } from '../utils/sql.js';

const nutritionSchema = safeSchema(env.DB_NUTRITION_SCHEMA);

const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const SMAE_SOURCE_REGEX = /(smae|mex)/i;

export type CsvRow = Record<string, string>;

export type MxMappings = {
  nutritionSystemId: number;
  smaeDataSourceId: number;
  groupIdByCode: Map<ExchangeGroupCode, number>;
  subgroupIdByCode: Map<ExchangeSubgroupCode, number>;
  parentGroupIdBySubgroupId: Map<number, number>;
};

export type ExternalSmaeFood = {
  rawName: string;
  normalizedName: string;
  origin: string;
  groupAlias: string;
  unitsRaw: string;
  equiQty: number | null;
  carbsPer100: number;
  proteinPer100: number;
  fatPer100: number;
};

export type MappedExternalBucket = {
  groupCode: ExchangeGroupCode;
  subgroupCode: ExchangeSubgroupCode | null;
};

export const normalizeText = (value: string | null | undefined): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export const writeCsv = async (filePath: string, rows: CsvRow[], headers: string[]): Promise<void> => {
  const escape = (value: string): string => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((header) => escape(String(row[header] ?? '')));
    lines.push(values.join(','));
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
};

export const parseCsv = async (filePath: string): Promise<CsvRow[]> => {
  const content = await readFile(filePath, 'utf8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    fields.push(current);
    return fields;
  };

  const headerLine = lines[0];
  if (!headerLine) return [];
  const headers = parseLine(headerLine).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: CsvRow = {};
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      if (!header) continue;
      row[header] = values[index] ?? '';
    }
    return row;
  });
};

export const loadMxMappings = async (): Promise<MxMappings> => {
  const systems = await nutritionPool.query<{ id: number; name: string }>(
    `
      SELECT id, name
      FROM ${nutritionSchema}.exchange_systems
      ORDER BY id ASC;
    `,
  );

  const smaeSystem = systems.rows.find((row) => SMAE_SOURCE_REGEX.test(normalizeText(row.name)));
  if (!smaeSystem) {
    throw new Error('Could not resolve nutrition.exchange_systems SMAE id');
  }

  const [groups, subgroups, dataSources] = await Promise.all([
    nutritionPool.query<{ id: number; name: string }>(
      `
        SELECT id, name
        FROM ${nutritionSchema}.exchange_groups
        WHERE system_id = $1
        ORDER BY id ASC;
      `,
      [smaeSystem.id],
    ),
    nutritionPool.query<{ id: number; exchange_group_id: number; name: string; parent_group_name: string }>(
      `
        SELECT es.id, es.exchange_group_id, es.name, eg.name AS parent_group_name
        FROM ${nutritionSchema}.exchange_subgroups es
        JOIN ${nutritionSchema}.exchange_groups eg ON eg.id = es.exchange_group_id
        WHERE eg.system_id = $1
        ORDER BY es.id ASC;
      `,
      [smaeSystem.id],
    ),
    nutritionPool.query<{ id: number; name: string }>(
      `
        SELECT id, name
        FROM ${nutritionSchema}.data_sources
        ORDER BY id ASC;
      `,
    ),
  ]);

  const groupIdByCode = new Map<ExchangeGroupCode, number>();
  for (const row of groups.rows) {
    const groupCode = inferGroupCodeFromText(row.name);
    if (!groupIdByCode.has(groupCode)) {
      groupIdByCode.set(groupCode, row.id);
    }
  }

  const subgroupIdByCode = new Map<ExchangeSubgroupCode, number>();
  const parentGroupIdBySubgroupId = new Map<number, number>();

  for (const row of subgroups.rows) {
    const parentCode = inferGroupCodeFromText(row.parent_group_name);
    const subgroupCode = inferSubgroupCodeFromText(row.name, parentCode);
    if (!subgroupCode) continue;

    if (!subgroupIdByCode.has(subgroupCode)) {
      subgroupIdByCode.set(subgroupCode, row.id);
    }
    parentGroupIdBySubgroupId.set(row.id, row.exchange_group_id);
  }

  const smaeDataSource = dataSources.rows.find((row) => SMAE_SOURCE_REGEX.test(normalizeText(row.name)));
  if (!smaeDataSource) {
    throw new Error('Could not resolve nutrition.data_sources SMAE id');
  }

  return {
    nutritionSystemId: smaeSystem.id,
    smaeDataSourceId: smaeDataSource.id,
    groupIdByCode,
    subgroupIdByCode,
    parentGroupIdBySubgroupId,
  };
};

const parseExternalGroupAlias = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const classifyAoaSubgroupByMacros = (proteinPer100: number, fatPer100: number): ExchangeSubgroupCode => {
  const fatPer7gPro = (fatPer100 / Math.max(proteinPer100, 0.1)) * 7;
  if (fatPer7gPro < 1.5) return 'aoa_muy_bajo_grasa';
  if (fatPer7gPro < 4) return 'aoa_bajo_grasa';
  if (fatPer7gPro < 7) return 'aoa_moderado_grasa';
  return 'aoa_alto_grasa';
};

const classifySugarSubgroupByMacros = (fatPer100: number): ExchangeSubgroupCode =>
  fatPer100 <= 1 ? 'azucar_sin_grasa' : 'azucar_con_grasa';

const classifyFatSubgroupByMacros = (proteinPer100: number): ExchangeSubgroupCode =>
  proteinPer100 >= 1.5 ? 'grasa_con_proteina' : 'grasa_sin_proteina';

export const mapExternalAliasToBucket = (
  alias: string,
  proteinPer100: number,
  fatPer100: number,
): MappedExternalBucket | null => {
  switch (alias) {
    case 'VE':
      return { groupCode: 'vegetable', subgroupCode: null };
    case 'FR':
      return { groupCode: 'fruit', subgroupCode: null };
    case 'LEG':
      return { groupCode: 'legume', subgroupCode: null };
    case 'CETU':
      return { groupCode: 'carb', subgroupCode: 'cereal_sin_grasa' };
    case 'CETUG':
      return { groupCode: 'carb', subgroupCode: 'cereal_con_grasa' };
    case 'OAMBG':
      return { groupCode: 'protein', subgroupCode: 'aoa_muy_bajo_grasa' };
    case 'OABG':
      return { groupCode: 'protein', subgroupCode: 'aoa_bajo_grasa' };
    case 'OAAG':
      return { groupCode: 'protein', subgroupCode: 'aoa_alto_grasa' };
    case 'OA':
      return { groupCode: 'protein', subgroupCode: classifyAoaSubgroupByMacros(proteinPer100, fatPer100) };
    case 'AZ':
      return { groupCode: 'sugar', subgroupCode: classifySugarSubgroupByMacros(fatPer100) };
    case 'G':
      return { groupCode: 'fat', subgroupCode: classifyFatSubgroupByMacros(proteinPer100) };
    case 'GP':
      return { groupCode: 'fat', subgroupCode: 'grasa_con_proteina' };
    default:
      return null;
  }
};

export const inferPortionUnit = (
  groupCode: ExchangeGroupCode,
  foodName: string,
  unitsRaw: string,
): 'g' | 'ml' => {
  if (groupCode === 'milk') return 'ml';

  const normalizedUnits = normalizeText(unitsRaw);
  const normalizedName = normalizeText(foodName);
  const looksLiquid =
    normalizedUnits.startsWith('l=') ||
    normalizedUnits.startsWith('ml=') ||
    normalizedUnits.startsWith('cc=') ||
    normalizedName.includes('jugo') ||
    normalizedName.includes('refresco') ||
    normalizedName.includes('bebida') ||
    normalizedName.includes('limonada') ||
    normalizedName.includes('atole') ||
    normalizedName.includes('malteada');

  return looksLiquid ? 'ml' : 'g';
};

export const sourceNameIsSmae = (value: string | null | undefined): boolean =>
  SMAE_SOURCE_REGEX.test(normalizeText(value));

export const fetchExternalSmaeFoods = async (): Promise<ExternalSmaeFood[]> => {
  const response = await fetch('https://www.sistemadigitaldealimentos.org/equivalentes/list_food', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch external SMAE list_food endpoint: ${response.status}`);
  }

  const json = await response.json();
  if (!Array.isArray(json)) {
    throw new Error('Unexpected list_food payload shape');
  }

  const rows: ExternalSmaeFood[] = [];

  for (const entry of json) {
    const origin = String((entry as Record<string, unknown>).origen ?? '').trim();
    if (!origin || !SMAE_SOURCE_REGEX.test(normalizeText(origin))) continue;

    const rawName = String((entry as Record<string, unknown>).nombreali ?? '').trim();
    if (!rawName) continue;

    const groupAlias = parseExternalGroupAlias((entry as Record<string, unknown>).grupoali);
    const unitsRaw = String((entry as Record<string, unknown>).unidades ?? '').trim();
    const equiQty = parseNumber((entry as Record<string, unknown>).equi);
    const carbsPer100 = parseNumber((entry as Record<string, unknown>).hdec) ?? 0;
    const proteinPer100 = parseNumber((entry as Record<string, unknown>).prot) ?? 0;
    const fatPer100 = parseNumber((entry as Record<string, unknown>).lip) ?? 0;

    rows.push({
      rawName,
      normalizedName: normalizeText(rawName),
      origin,
      groupAlias,
      unitsRaw,
      equiQty: equiQty !== null && equiQty > 0 ? equiQty : null,
      carbsPer100,
      proteinPer100,
      fatPer100,
    });
  }

  return rows;
};

const stripGuidePrefix = (line: string): string => {
  let result = normalizeText(line.replace(/^[-*]\s*/, ''));
  result = result
    .replace(/^(\d+|[0-9\/\.]+)\s*(taza|tazas|pieza|piezas|cucharada|cucharadas|rebanada|rebanadas|ml|g)\s+/, '')
    .replace(/^(medio|media|mitad)\s+/, '')
    .trim();
  return result;
};

export const loadGuideTokens = async (guidePath: string): Promise<Set<string>> => {
  try {
    const content = await readFile(guidePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const tokens = new Set<string>();

    for (const line of lines) {
      if (!line.trim().startsWith('-')) continue;
      const token = stripGuidePrefix(line);
      if (token.length >= 4) {
        tokens.add(token);
      }
    }

    return tokens;
  } catch {
    return new Set<string>();
  }
};

export const bestGuideTokenMatch = (foodName: string, tokens: Set<string>): string | null => {
  if (tokens.size === 0) return null;
  const normalizedFood = normalizeText(foodName);

  for (const token of tokens) {
    if (normalizedFood.includes(token) || token.includes(normalizedFood)) {
      return token;
    }
  }

  const stemWord = (word: string): string => {
    if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
    return word;
  };

  const toStemmedWordSet = (value: string): Set<string> =>
    new Set(
      normalizeText(value)
        .split(' ')
        .map((part) => stemWord(part))
        .filter((part) => part.length >= 3),
    );

  const foodWords = toStemmedWordSet(normalizedFood);
  if (foodWords.size === 0) return null;

  for (const token of tokens) {
    const tokenWords = toStemmedWordSet(token);
    if (tokenWords.size === 0) continue;

    let shared = 0;
    for (const word of foodWords) {
      if (tokenWords.has(word)) {
        shared += 1;
      }
    }

    const score = shared / Math.max(foodWords.size, tokenWords.size);
    if (score >= 0.67 && shared >= 1) {
      return token;
    }
  }

  return null;
};

export const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await mkdir(directoryPath, { recursive: true });
};

export const mandatorySubgroupGroupCodes = new Set<ExchangeGroupCode>(['carb', 'protein', 'milk', 'fat', 'sugar']);

export { nutritionSchema };
