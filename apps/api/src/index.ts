import { loadEnv } from "@markus/config";
import { RagPipeline, RAG_PROMPT_VERSION, type ChatClient } from "@markus/kb";
import {
  LlmGateway,
  LlmUnavailableError,
  type LlmCallRecord,
} from "@markus/llm-gateway";
import {
  BOOTSTRAP_MODEL,
  CorpusAssessmentScorer,
  DISCLAIMER_VERSION,
  PrismaCorpusSearcher,
  PrismaCorpusStore,
  type CorpusSqlClient,
  type CorpusTransactionHost,
} from "@markus/tm-data";
import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";

import { createApp, type AssistantService } from "./app.js";
import {
  MagicLinkService,
  PrismaMagicLinkStore,
  PrismaStaffCredentialStore,
  PrismaTotpSeedVault,
  RedisKeyValueStore,
  RedisSessionIndexStore,
  SessionService,
  StaffAuthService,
  argon2Passwords,
  type TotpSeedVault,
} from "./auth/index.js";
import { RedisAssessmentCache } from "./assessment-cache.js";
import { PrismaClientStore } from "./client.js";
import { PrismaDocumentStore } from "./documents.js";
import { MagicLinkEmailDeliverer, mailSenderFromEnv } from "./mail.js";
import { MetricsRegistry } from "./metrics.js";
import { PrismaNotificationStore } from "./notifications.js";
import { RedisRateLimiter } from "./rate-limit.js";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const env = loadEnv();

/**
 * Redacted provider audit trail (M6.3): structural counts only, never the prompt
 * text or the completion. The hash links a call to its exact (unlogged) input.
 */
const auditCall = (record: LlmCallRecord): void => {
  const line = JSON.stringify({
    task: record.task,
    provider: record.provider,
    model: record.model,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    costUsd: record.costUsd,
    durationMs: record.durationMs,
    promptHash: record.promptHash,
    ok: record.ok,
  });
  if (record.ok) {
    console.log("[llm]", line);
  } else {
    console.error("[llm]", line);
  }
};

/**
 * The real gateway only when a primary endpoint is configured; otherwise an
 * always-unavailable client keeps `/tm/assistant` degraded (cited, no answer,
 * M6.4) without any outbound call. `RagPipeline` needs only the structural
 * `ChatClient`.
 */
const chatClient: ChatClient = env.LLM_PRIMARY_BASE_URL
  ? new LlmGateway(
      {
        primary: {
          baseUrl: env.LLM_PRIMARY_BASE_URL,
          apiKey: env.LLM_PRIMARY_API_KEY ?? "",
          model: env.LLM_PRIMARY_MODEL ?? "",
        },
        ...(env.LLM_FALLBACK_BASE_URL === undefined
          ? {}
          : {
              fallback: {
                baseUrl: env.LLM_FALLBACK_BASE_URL,
                apiKey: env.LLM_FALLBACK_API_KEY ?? "",
                model: env.LLM_FALLBACK_MODEL ?? "",
              },
            }),
        embedUrl: env.BGE_EMBED_URL,
      },
      { onCall: auditCall },
    )
  : {
      async chat() {
        throw new LlmUnavailableError(
          "LLM provider not configured (LLM_PRIMARY_BASE_URL is empty)",
        );
      },
    };

const ragPipeline = new RagPipeline(chatClient);

const assistant: AssistantService = {
  async answer(input) {
    const result = await ragPipeline.answer(input);
    if (result.status === "ok") {
      return {
        status: "ok",
        answer: result.answer,
        citations: result.citations,
        locale: result.locale,
        version: RAG_PROMPT_VERSION,
        provider: result.provider,
        model: result.model,
      };
    }
    return {
      status: "degraded",
      answer: null,
      citations: result.citations,
      locale: result.locale,
      version: RAG_PROMPT_VERSION,
    };
  },
};

const prisma = new PrismaClient();

const redis = new Redis(env.REDIS_URL);
redis.on("error", (error: Error) => {
  console.error("[api] redis error:", error.message);
});

const search = new PrismaCorpusSearcher(prisma as unknown as CorpusSqlClient);

// P2.1 auth wiring: Redis sessions + Postgres credential/token stores.
const authKv = new RedisKeyValueStore(redis);
const sessions = new SessionService(authKv, new RedisSessionIndexStore(redis));
const staffStore = new PrismaStaffCredentialStore(prisma);
// Fail closed when the vault key is absent (D-01): TOTP-enrolled logins deny.
const totpVault: TotpSeedVault = env.VAULT_MASTER_KEY
  ? new PrismaTotpSeedVault(prisma, env.VAULT_MASTER_KEY)
  : { revealSeed: async () => null };
const rateLimiter = new RedisRateLimiter(redis);

const staffAuth = new StaffAuthService({
  store: staffStore,
  sessions,
  kv: authKv,
  rateLimiter,
  passwords: argon2Passwords,
  totpVault,
});

/**
 * P2.5 (DQ-017): DirectMail when configured (required in production — fail
 * closed in packages/config), otherwise the metadata-only logger (dev/test,
 * or staging with the explicit DIRECTMAIL_ALLOW_LOGGER_FALLBACK opt-in).
 */
const mailSender = mailSenderFromEnv(env);
const magicLinkDeliverer = new MagicLinkEmailDeliverer({ mail: mailSender });

const magicLinks = new MagicLinkService({
  store: new PrismaMagicLinkStore(prisma),
  sessions,
  rateLimiter,
  deliverer: magicLinkDeliverer,
  secret: env.MAGIC_LINK_SECRET,
  publicBaseUrl: env.PUBLIC_BASE_URL,
});

const app = createApp(
  {
    search,
    store: new PrismaCorpusStore(prisma as unknown as CorpusTransactionHost),
    assess: new CorpusAssessmentScorer({
      searcher: search,
      model: BOOTSTRAP_MODEL,
      disclaimerVersion: DISCLAIMER_VERSION,
    }),
    auth: { sessions, staffAuth, magicLinks },
    assistant,
    cache: new RedisAssessmentCache(redis),
    rateLimiter,
    metrics: new MetricsRegistry(),
    // P2.2–P2.4 client portal surfaces (wired into the production entry here).
    client: new PrismaClientStore(prisma, env.PUBLIC_BASE_URL),
    documents: new PrismaDocumentStore(prisma, env.PUBLIC_BASE_URL),
    notifications: new PrismaNotificationStore(prisma),
  },
  {
    freshnessSlaHours: env.TM_CORPUS_FRESHNESS_HOURS,
    assessmentCacheTtlSeconds: env.TM_ASSESSMENT_CACHE_TTL_SECONDS,
    assessRateIpPerHour: env.TM_ASSESS_RATE_IP_PER_HOUR,
    assessRateMarkPerHour: env.TM_ASSESS_RATE_MARK_PER_HOUR,
    assistantRateIpPerHour: env.TM_ASSISTANT_RATE_IP_PER_HOUR,
    assistantPromptVersion: RAG_PROMPT_VERSION,
    modelVersion: BOOTSTRAP_MODEL.version,
    disclaimerVersion: DISCLAIMER_VERSION,
    metricsEnabled: true,
    secureCookies: env.NODE_ENV === "production",
  },
);

serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`markus-api listening on :${env.PORT}`);
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`[api] ${signal} received — shutting down`);
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
