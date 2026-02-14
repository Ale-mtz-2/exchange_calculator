import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

const buildPrismaUrl = (): string => {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set('connection_limit', String(env.PRISMA_CONNECTION_LIMIT));
  url.searchParams.set('pool_timeout', String(env.PRISMA_POOL_TIMEOUT_SECONDS));
  url.searchParams.set('application_name', 'equivalentes_api_prisma');
  return url.toString();
};

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    datasources: {
      db: {
        url: buildPrismaUrl(),
      },
    },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
