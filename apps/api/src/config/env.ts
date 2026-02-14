import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  PRISMA_CONNECTION_LIMIT: z.coerce.number().int().positive().max(20).default(2),
  PRISMA_POOL_TIMEOUT_SECONDS: z.coerce.number().int().positive().max(120).default(20),
  PG_POOL_MAX: z.coerce.number().int().positive().max(20).default(2),
  PG_POOL_MIN: z.coerce.number().int().min(0).max(10).default(0),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(10000),
  PG_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().max(120000).default(10000),
  PG_MAX_USES: z.coerce.number().int().positive().max(100000).default(750),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  ADMIN_USER: z.string().min(1).default('admin'),
  ADMIN_PASS: z.string().min(1).default('changeme'),
  DB_APP_SCHEMA: z.string().min(1).default('equivalentes_app'),
  DB_NUTRITION_SCHEMA: z.string().min(1).default('nutrition'),
  MANYCHAT_API_TOKEN: z.string().optional(),
  MANYCHAT_TAG_NAME: z.string().default('Uso_Equivalentes'),
  MANYCHAT_CUSTOM_FIELD_NAME: z.string().default('last_equivalentes_use'),
  MANYCHAT_CUSTOM_FIELD_CAMPAIGN: z.string().optional(),
  MANYCHAT_ENABLED: z.enum(['true', 'false']).default('false'),
  SMAE_SUBGROUPS_ENABLED: z.enum(['true', 'false']).default('true'),
});

export const env = envSchema.parse(process.env);

export const isManyChatEnabled =
  env.MANYCHAT_ENABLED === 'true' && Boolean(env.MANYCHAT_API_TOKEN?.trim());

export const isSmaeSubgroupsEnabled = env.SMAE_SUBGROUPS_ENABLED === 'true';
