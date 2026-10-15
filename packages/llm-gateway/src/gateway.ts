/**
 * OpenAI-compatible LLM gateway (D-04, mandates M6.3/M6.4).
 *
 * `POST {baseUrl}/chat/completions` with a primary + independent fallback,
 * bounded retries (exponential backoff + jitter) and a per-provider circuit
 * breaker; `POST {embedUrl}/embeddings` for the managed BGE-family API (no
 * fallback, but the same breaker). Every provider outcome emits a redacted
 * audit record; the raw prompt is never logged. When everything is exhausted the
 * caller gets `LlmUnavailableError`, so it can degrade (M6.4) rather than
 * fabricate a result.
 */

import { createHash } from "node:crypto";

import { z } from "zod";

import { CircuitBreaker, DEFAULT_CIRCUIT_CONFIG, type CircuitConfig } from "./circuit.js";
import {
  computeCostUsd,
  configFromEnv,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_RETRIES,
  resolveModel,
  type GatewayConfig,
  type LlmProviderConfig,
} from "./config.js";
import { assertNoPii } from "./pii.js";
import {
  LlmUnavailableError,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedResult,
  type LlmCallRecord,
  type LlmGatewayDeps,
  type LlmProviderName,
  type LlmTask,
  type LlmUsage,
} from "./types.js";

const DEFAULT_TASK: LlmTask = "chatbot";

const chatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullish() }) }))
    .min(1),
  usage: z
    .object({ prompt_tokens: z.number().nonnegative(), completion_tokens: z.number().nonnegative() })
    .optional(),
});

const embedResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative().optional(),
      total_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
});

export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  stream: false;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

/** Deterministic OpenAI-compatible body: only defined fields, fixed key order. */
export function buildChatRequestBody(
  model: string,
  messages: readonly ChatMessage[],
  opts: ChatOptions,
): ChatRequestBody {
  const body: ChatRequestBody = {
    model,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    stream: false,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.json === true) body.response_format = { type: "json_object" };
  return body;
}

const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, "")}${path}`;

const sha256 = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const buildUsage = (model: string, promptTokens: number, completionTokens: number): LlmUsage => ({
  model,
  promptTokens,
  completionTokens,
  costUsd: computeCostUsd(model, promptTokens, completionTokens),
});

/** Internal classification of a single HTTP attempt. */
class LlmRequestError extends Error {
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(message: string, options: { retryable: boolean; status?: number; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LlmRequestError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

interface ProviderEntry {
  name: LlmProviderName;
  provider: LlmProviderConfig;
}

interface EmitInput {
  task: LlmTask;
  model: string;
  provider: LlmProviderName;
  usage: LlmUsage;
  durationMs: number;
  promptHash: string;
  ok: boolean;
}

type BreakerKey = LlmProviderName | "embeddings";

export class LlmGateway {
  readonly #config: GatewayConfig;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #onCall: (record: LlmCallRecord) => void;
  readonly #breakers: Record<BreakerKey, CircuitBreaker>;

  constructor(config: GatewayConfig = configFromEnv(), deps: LlmGatewayDeps = {}) {
    this.#config = config;
    this.#fetch = deps.fetch ?? globalThis.fetch;
    this.#now = deps.now ?? Date.now;
    this.#random = deps.random ?? Math.random;
    this.#sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#onCall = deps.onCall ?? (() => undefined);

    const circuit: CircuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...config.circuit };
    this.#breakers = {
      primary: new CircuitBreaker(circuit, this.#now),
      fallback: new CircuitBreaker(circuit, this.#now),
      embeddings: new CircuitBreaker(circuit, this.#now),
    };
  }

  async chat(
    messages: ChatMessage[],
    opts: ChatOptions & { context?: Record<string, unknown> } = {},
  ): Promise<ChatResult> {
    const task = opts.task ?? DEFAULT_TASK;
    assertNoPii(messages, opts.context);
    const promptHash = sha256(messages);

    let lastError: LlmUnavailableError | undefined;
    for (const { name, provider } of this.#providerEntries()) {
      const model = resolveModel(this.#config.models, provider, task, opts.model);
      const startedAt = this.#now();
      try {
        const parsed = await this.#post(
          joinUrl(provider.baseUrl, "/chat/completions"),
          name,
          buildChatRequestBody(model, messages, opts),
          (data) => chatResponseSchema.parse(data),
          provider.apiKey,
        );
        const promptTokens = parsed.usage?.prompt_tokens ?? 0;
        const completionTokens = parsed.usage?.completion_tokens ?? 0;
        const usage = buildUsage(model, promptTokens, completionTokens);
        this.#emit({
          task,
          model,
          provider: name,
          usage,
          durationMs: this.#now() - startedAt,
          promptHash,
          ok: true,
        });
        return { content: parsed.choices[0]?.message.content ?? "", usage, provider: name };
      } catch (error) {
        this.#emit({
          task,
          model,
          provider: name,
          usage: buildUsage(model, 0, 0),
          durationMs: this.#now() - startedAt,
          promptHash,
          ok: false,
        });
        lastError = new LlmUnavailableError(
          `LLM provider "${name}" failed for task "${task}": ${errorMessage(error)}`,
          { cause: error },
        );
      }
    }

    throw lastError ?? new LlmUnavailableError("no LLM provider configured");
  }

  async embed(text: string, opts: { task?: LlmTask } = {}): Promise<EmbedResult> {
    const task = opts.task ?? "embeddings";
    assertNoPii([{ role: "user", content: text }]);

    const embedUrl = this.#config.embedUrl;
    if (!embedUrl) {
      throw new LlmUnavailableError("no embedding endpoint configured (BGE_EMBED_URL)");
    }

    const model = resolveModel(this.#config.models, this.#config.primary, task);
    const promptHash = sha256(text);
    const startedAt = this.#now();
    try {
      const parsed = await this.#post(
        joinUrl(embedUrl, "/embeddings"),
        "embeddings",
        { model, input: text },
        (data) => embedResponseSchema.parse(data),
        this.#config.primary.apiKey,
      );
      const promptTokens = parsed.usage?.prompt_tokens ?? parsed.usage?.total_tokens ?? 0;
      const usage = buildUsage(model, promptTokens, 0);
      this.#emit({
        task,
        model,
        provider: "primary",
        usage,
        durationMs: this.#now() - startedAt,
        promptHash,
        ok: true,
      });
      return { embedding: parsed.data[0]?.embedding ?? [], usage, provider: "primary" };
    } catch (error) {
      this.#emit({
        task,
        model,
        provider: "primary",
        usage: buildUsage(model, 0, 0),
        durationMs: this.#now() - startedAt,
        promptHash,
        ok: false,
      });
      if (error instanceof LlmUnavailableError) throw error;
      throw new LlmUnavailableError(
        `embedding provider unavailable: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  #providerEntries(): ProviderEntry[] {
    const entries: ProviderEntry[] = [{ name: "primary", provider: this.#config.primary }];
    if (this.#config.fallback) entries.push({ name: "fallback", provider: this.#config.fallback });
    return entries;
  }

  /** Retry loop + circuit breaker for one provider attempt. */
  async #post<T>(
    url: string,
    breakerKey: BreakerKey,
    body: unknown,
    parse: (data: unknown) => T,
    apiKey: string,
  ): Promise<T> {
    const breaker = this.#breakers[breakerKey];
    const maxRetries = this.#config.maxRetries ?? DEFAULT_MAX_RETRIES;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };

    let attempt = 0;
    for (;;) {
      if (!breaker.canAttempt()) {
        throw new LlmUnavailableError(`${breakerKey} circuit is open`);
      }
      try {
        const data = await this.#fetchJson(url, init);
        const value = parse(data);
        breaker.onSuccess();
        return value;
      } catch (error) {
        const retryable =
          error instanceof LlmRequestError ? error.retryable : error instanceof z.ZodError;
        if (!retryable) {
          breaker.onSuccess();
          throw error;
        }
        breaker.onFailure();
        if (attempt >= maxRetries) throw error;
        await this.#sleep(this.#backoff(attempt));
        attempt += 1;
      }
    }
  }

  async #fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(url, init);
    } catch (cause) {
      throw new LlmRequestError("network request failed", { retryable: true, cause });
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new LlmRequestError(`provider responded ${response.status}`, {
        retryable,
        status: response.status,
      });
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new LlmRequestError("provider returned invalid JSON", { retryable: true, cause });
    }
  }

  #backoff(attempt: number): number {
    const base = (this.#config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS) * 2 ** attempt;
    return base + Math.floor(this.#random() * base);
  }

  #emit(input: EmitInput): void {
    this.#onCall({
      task: input.task,
      model: input.model,
      provider: input.provider,
      promptTokens: input.usage.promptTokens,
      completionTokens: input.usage.completionTokens,
      costUsd: input.usage.costUsd,
      durationMs: input.durationMs,
      promptHash: input.promptHash,
      ok: input.ok,
    });
  }
}
