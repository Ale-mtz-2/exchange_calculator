import { app } from './app.js';
import { env } from './config/env.js';
import { nutritionPool } from './db/pg.js';
import { prisma } from './db/prisma.js';

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

const shutdown = async (): Promise<void> => {
  await Promise.all([prisma.$disconnect(), nutritionPool.end()]);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
