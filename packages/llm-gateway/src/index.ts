/**
 * LLM gateway (D-04): OpenAI-compatible router with primary + fallback and a
 * per-provider circuit breaker.
 *
 * Primary: mainland-China provider (DeepSeek / GLM / Kimi K3) for latency and
 * data residency; fallback configured independently. Embeddings use a managed
 * OpenAI-compatible BGE-family API (D-15 — no always-on self-hosted service).
 * Client PII never crosses the boundary (M6.3 / rule G3): prompts are guarded
 * before any network call and audited only as a redacted hash. When every
 * provider is down, callers get `LlmUnavailableError` so the assessment can
 * degrade to `INSUFFICIENT_DATA` (M6.4).
 */

export { LlmPiiError, LlmUnavailableError } from "./types.js";
export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
  LlmCallRecord,
  LlmGatewayDeps,
  LlmProviderName,
  LlmTask,
  LlmUsage,
} from "./types.js";

export {
  computeCostUsd,
  configFromEnv,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL_PRICE,
  MODEL_PRICES,
  priceForModel,
  resolveModel,
} from "./config.js";
export type { GatewayConfig, LlmProviderConfig, ModelPrice } from "./config.js";

export { CircuitBreaker, DEFAULT_CIRCUIT_CONFIG } from "./circuit.js";
export type { CircuitConfig, CircuitState } from "./circuit.js";

export { assertNoPii, PII_DENYLIST, scanText } from "./pii.js";
export type { PiiHit, PiiKind } from "./pii.js";

export { buildChatRequestBody, LlmGateway } from "./gateway.js";
export type { ChatRequestBody } from "./gateway.js";
