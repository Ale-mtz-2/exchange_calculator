import 'dotenv/config';

import { nutritionPool } from '../db/pg.js';
import { syncGeoMetadataBaseline } from '../services/geoMetadataBaseline.js';

const run = async (): Promise<void> => {
  const results = await syncGeoMetadataBaseline();

  if (results.length === 0) {
    console.log('No active supported systems found (mx_smae/us_usda). Nothing to sync.');
    return;
  }

  let totalDeleted = 0;
  let totalInserted = 0;

  for (const result of results) {
    totalDeleted += result.deletedRows;
    totalInserted += result.insertedRows;
    console.log(
      [
        `[geo-metadata] ${result.systemId} (${result.countryCode})`,
        `nutrition_system_id=${result.nutritionSystemId}`,
        `deleted=${result.deletedRows}`,
        `inserted=${result.insertedRows}`,
      ].join(' | '),
    );
  }

  console.log(`[geo-metadata] totals | deleted=${totalDeleted} | inserted=${totalInserted}`);
};

run()
  .then(async () => {
    await nutritionPool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await nutritionPool.end();
    process.exit(1);
  });
