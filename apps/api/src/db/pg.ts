import { Pool } from 'pg';

import { env } from '../config/env.js';

const createNutritionPool = (): Pool => {
  const connectionUrl = new URL(env.DATABASE_URL);
  connectionUrl.searchParams.delete('sslmode');
  connectionUrl.searchParams.delete('connection_limit');

  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    ssl: {
      rejectUnauthorized: false,
    },
    max: env.PG_POOL_MAX,
    min: env.PG_POOL_MIN,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
    maxUses: env.PG_MAX_USES,
    allowExitOnIdle: env.NODE_ENV === 'test',
  });

  pool.on('error', (error) => {
    console.error('Unexpected PG pool error:', error.message);
  });

  return pool;
};

const globalForPg = globalThis as unknown as { nutritionPool?: Pool };

export const nutritionPool = globalForPg.nutritionPool ?? createNutritionPool();

if (env.NODE_ENV !== 'production') {
  globalForPg.nutritionPool = nutritionPool;
}
