/**
 * Gateway configuration, task→model routing and the cost table (D-04).
 *
 * Swapping a model is a config-only change: a task map entry overrides the
 * provider default, so no call site changes. Prices are USD per 1M tokens; an
 * unknown model falls back to a documented conservative default rather than
 * reporting zero cost.
 */

import { type CircuitConfig } from "./circuit.js";
import type { LlmTask } from "./types.js";

export interface LlmProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface GatewayConfig {
  primary: LlmProviderConfig;
  fallback?: LlmProviderConfig;
  /** Managed OpenAI-compatible embedding endpoint (`POST {embedUrl}/embeddings`). */
  embedUrl?: string;
  /** Task→model override; applies to whichever provider serves the task. */
  models?: Partial<Record<LlmTask, string>>;
  /** Retries after the first attempt, per provider; default 2. */
  maxRetries?: number;
  /** Exponential backoff base in ms; default 200. */
  backoffBaseMs?: number;
  /** Per-provider circuit-breaker tuning. */
  circuit?: Partial<CircuitConfig>;
}

export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_BACKOFF_BASE_MS = 200;

/** Reads the D-04 env names; every var is optional and validated by packages/config. */
export function configFromEnv(): GatewayConfig {
  const value = (key: string): string => process.env[key] ?? "";
  return {
    primary: {
      baseUrl: value("LLM_PRIMARY_BASE_URL"),
      apiKey: value("LLM_PRIMARY_API_KEY"),
      model: value("LLM_PRIMARY_MODEL"),
    },
    fallback: process.env.LLM_FALLBACK_BASE_URL
      ? {
          baseUrl: process.env.LLM_FALLBACK_BASE_URL,
          apiKey: process.env.LLM_FALLBACK_API_KEY ?? "",
          model: process.env.LLM_FALLBACK_MODEL ?? "",
        }
      : undefined,
    embedUrl: process.env.BGE_EMBED_URL || undefined,
  };
}

export interface ModelPrice {
  /** USD per 1M prompt tokens. */
  prompt: number;
  /** USD per 1M completion tokens. */
  completion: number;
}

/**
 * Documented fallback price for a model missing from `MODEL_PRICES`. Chosen
 * high enough that an unlisted model is never under-billed or mis-reported as
 * free; edit the table when a provider changes its list price.
 */
export const DEFAULT_MODEL_PRICE: ModelPrice = { prompt: 1, completion: 3 };

/** USD per 1M tokens. Mainland providers (D-04) + the managed BGE-family embed API. */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "deepseek-chat": { prompt: 0.27, completion: 1.1 },
  "deepseek-reasoner": { prompt: 0.55, completion: 2.19 },
  "glm-4-plus": { prompt: 0.69, completion: 2.75 },
  "glm-4-air": { prompt: 0.07, completion: 0.07 },
  "moonshot-v1-8k": { prompt: 1.68, completion: 1.68 },
  "moonshot-v1-32k": { prompt: 3.36, completion: 3.36 },
  "bge-m3": { prompt: 0.02, completion: 0 },
  "bge-large-zh-v1.5": { prompt: 0.02, completion: 0 },
};

export function priceForModel(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? DEFAULT_MODEL_PRICE;
}

/** Cost in USD, rounded to 12 decimals to trim float noise without losing tiny embed costs. */
export function computeCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = priceForModel(model);
  const cost = (promptTokens * price.prompt + completionTokens * price.completion) / 1_000_000;
  return Number(cost.toFixed(12));
}

/** Precedence: explicit override → task map → provider default (D-04). */
export function resolveModel(
  models: Partial<Record<LlmTask, string>> | undefined,
  provider: LlmProviderConfig,
  task: LlmTask,
  override?: string,
): string {
  return override ?? models?.[task] ?? provider.model;
}
