
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const prisma = new PrismaClient();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    console.log('--- Checking Subgroup Macros ---');
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT id, name, cho_g, pro_g, fat_g FROM nutrition.exchange_subgroups');
        console.log('Subgroups (PG):', JSON.stringify(res.rows, null, 2));
    } finally {
        client.release();
    }

    await prisma.$disconnect();
    await pool.end();
}

main().catch(console.error);
