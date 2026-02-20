
import { nutritionPool } from '../db/pg.js';

async function check() {
    const client = await nutritionPool.connect();
    try {
        const res = await client.query(`
      SELECT pid, state, query_start, query 
      FROM pg_stat_activity 
      WHERE query NOT LIKE '%pg_stat_activity%'
      ORDER BY query_start DESC
      LIMIT 10;
    `);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        process.exit(0);
    }
}

check();
