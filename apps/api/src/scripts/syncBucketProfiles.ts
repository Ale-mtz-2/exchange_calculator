import type { ExchangeSystemId } from '@equivalentes/shared';
import { EXCHANGE_SYSTEMS } from '@equivalentes/shared';

import { rebuildBucketProfiles } from '../services/bucketProfileBuilder.js';

const parseArg = (name: string): string | undefined => {
  const prefix = `${name}=`;
  const exact = process.argv.find((arg) => arg === name);
  if (exact) {
    const index = process.argv.indexOf(exact);
    return process.argv[index + 1];
  }

  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (!withEquals) return undefined;
  return withEquals.slice(prefix.length);
};

const main = async (): Promise<void> => {
  const profileVersion = parseArg('--version');
  const systemRaw = parseArg('--system');

  if (!profileVersion) {
    throw new Error('Missing required --version YYYYMMDD');
  }

  const validSystems = new Set(EXCHANGE_SYSTEMS.map((system) => system.id));
  let selectedSystem: ExchangeSystemId | undefined;

  if (systemRaw) {
    if (!validSystems.has(systemRaw as ExchangeSystemId)) {
      throw new Error(`Invalid --system value: ${systemRaw}`);
    }
    selectedSystem = systemRaw as ExchangeSystemId;
  }

  const results = await rebuildBucketProfiles(profileVersion, selectedSystem);
  const totalRows = results.reduce((sum, row) => sum + row.rows, 0);

  console.log(`Bucket profiles rebuilt for version=${profileVersion}`);
  for (const row of results) {
    console.log(`- ${row.systemId}: ${row.rows} rows`);
  }
  console.log(`Total rows: ${totalRows}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
