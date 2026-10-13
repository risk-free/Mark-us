import { loadEnv } from "@markus/config";
import { PrismaCorpusSearcher, PrismaCorpusStore, type CorpusSqlClient, type CorpusTransactionHost } from "@markus/tm-data";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";

import { createApp } from "./app.js";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const env = loadEnv();

const prisma = new PrismaClient();

const app = createApp(
  {
    search: new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient),
    store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
  },
  { freshnessSlaHours: env.TM_CORPUS_FRESHNESS_HOURS },
);

serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`markus-api listening on :${env.PORT}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[api] ${signal} received — shutting down`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));