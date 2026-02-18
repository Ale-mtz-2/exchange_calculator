import 'dotenv/config';

import { nutritionPool } from '../db/pg.js';
import { loadMxMappings } from './smaeFoodCurationUtils.js';

const main = async (): Promise<void> => {
  const mappings = await loadMxMappings();

  const [foodsNullServing, overridesNullServing, overrideMismatch, latestNonSmae, aoaDistribution] = await Promise.all([
    nutritionPool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM nutrition.foods f
        JOIN nutrition.exchange_groups eg ON eg.id = f.exchange_group_id
        WHERE eg.system_id = $1
          AND (f.base_serving_size IS NULL OR f.base_serving_size <= 0);
      `,
      [mappings.nutritionSystemId],
    ),
    nutritionPool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM equivalentes_app.food_exchange_overrides
        WHERE system_id = 'mx_smae'
          AND is_active = true
          AND (equivalent_portion_qty IS NULL OR equivalent_portion_qty <= 0);
      `,
    ),
    nutritionPool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM equivalentes_app.food_exchange_overrides feo
        JOIN nutrition.exchange_subgroups es ON es.id = feo.subgroup_id
        WHERE feo.system_id = 'mx_smae'
          AND feo.is_active = true
          AND feo.group_id IS DISTINCT FROM es.exchange_group_id;
      `,
    ),
    nutritionPool.query<{ count: number; sample_food_ids: string }>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (fnv.food_id)
            fnv.food_id,
            ds.name AS source_name
          FROM nutrition.food_nutrition_values fnv
          LEFT JOIN nutrition.data_sources ds ON ds.id = fnv.data_source_id
          LEFT JOIN equivalentes_app.exchange_source_priorities esp
            ON esp.system_id = 'mx_smae'
           AND esp.data_source_id = fnv.data_source_id
           AND esp.is_active = true
          WHERE fnv.deleted_at IS NULL
          ORDER BY fnv.food_id,
            CASE WHEN fnv.state = 'standard' THEN 0 ELSE 1 END,
            COALESCE(esp.priority, 1000),
            fnv.id DESC
        )
        SELECT
          COUNT(*)::int AS count,
          COALESCE(string_agg(food_id::text, ',' ORDER BY food_id), '') AS sample_food_ids
        FROM latest
        WHERE translate(lower(COALESCE(source_name,'')), 'αινσϊδλοφόρ', 'aeiouaeioun') NOT SIMILAR TO '%(smae|mex)%';
      `,
    ),
    nutritionPool.query<{ serving_qty: number; count: number }>(
      `
        SELECT
          f.base_serving_size::float8 AS serving_qty,
          COUNT(*)::int AS count
        FROM nutrition.foods f
        JOIN nutrition.exchange_groups eg ON eg.id = f.exchange_group_id
        WHERE eg.system_id = $1
          AND translate(lower(COALESCE(eg.name,'')), 'αινσϊδλοφόρ', 'aeiouaeioun') LIKE '%origen animal%'
        GROUP BY f.base_serving_size::float8
        ORDER BY count DESC, serving_qty;
      `,
      [mappings.nutritionSystemId],
    ),
  ]);

  const foodsNullServingCount = foodsNullServing.rows[0]?.count ?? 0;
  const overridesNullServingCount = overridesNullServing.rows[0]?.count ?? 0;
  const overrideMismatchCount = overrideMismatch.rows[0]?.count ?? 0;
  const latestNonSmaeCount = latestNonSmae.rows[0]?.count ?? 0;

  console.log('Validation summary');
  console.log(`- SMAE foods with NULL/<=0 serving: ${foodsNullServingCount}`);
  console.log(`- Active mx_smae overrides with NULL/<=0 portion: ${overridesNullServingCount}`);
  console.log(`- Override group/subgroup parent mismatches: ${overrideMismatchCount}`);
  console.log(`- Latest non-SMAE canonical candidates for mx_smae: ${latestNonSmaeCount}`);
  if (latestNonSmaeCount > 0) {
    console.log(`  sample food ids: ${latestNonSmae.rows[0]?.sample_food_ids ?? ''}`);
  }
  console.log('- AOA serving distribution:');
  for (const row of aoaDistribution.rows) {
    console.log(`  ${row.serving_qty}: ${row.count}`);
  }

  const hasCriticalFailure = foodsNullServingCount > 0 || overridesNullServingCount > 0 || overrideMismatchCount > 0;
  if (hasCriticalFailure) {
    throw new Error('SMAE curation validation failed due to critical integrity checks');
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await nutritionPool.end().catch(() => undefined);
  });
