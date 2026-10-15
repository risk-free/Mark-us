/**
 * LLM gateway contract (D-04, mandates M6.3/M6.4).
 *
 * The gateway is the single boundary where prompt text leaves our process for a
 * third-party model. Everything crossing it is minimised to mark text, class,
 * jurisdiction and business context (rule G3); the payload that reaches a
 * provider is only ever observed through a redacted hash (M6.3). Failures are
 * surfaced as typed errors so callers can degrade (M6.4) instead of fabricating
 * a score.
 */

/** Model-per-task routing key (D-04). */
export type LlmTask =
  | "lead_qualification"
  | "oa_classification"
  | "suggestions"
  | "chatbot"
  | "proofread_rewrite"
  | "embeddings";

/** Which configured endpoint answered a call. */
export type LlmProviderName = "primary" | "fallback";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Explicit model override; wins over the task map and provider default. */
  model?: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  /** Selects the task→model map entry and the audit bucket. */
  task?: LlmTask;
}

export interface LlmUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface ChatResult {
  content: string;
  usage: LlmUsage;
  provider: LlmProviderName;
}

export interface EmbedResult {
  embedding: number[];
  usage: LlmUsage;
  provider: LlmProviderName;
}

/** Redacted audit record emitted for every provider outcome (M6.3). */
export interface LlmCallRecord {
  task: LlmTask;
  model: string;
  provider: LlmProviderName;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
  /** sha256 of the serialised prompt — never the raw text. */
  promptHash: string;
  ok: boolean;
}

export interface LlmGatewayDeps {
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  /** Injected so retry backoff can be driven without real timers (M13.6). */
  sleep?: (ms: number) => Promise<void>;
  onCall?: (record: LlmCallRecord) => void;
}

/**
 * Thrown before any network call when a denylisted field is set or a message
 * body matches a PII pattern (M6.3 / rule G3). The message never echoes the
 * matched value — only the pattern kind and position.
 */
export class LlmPiiError extends Error {
  /** The offending field key, or the pattern kind (`email`/`phone`/`contactId`). */
  readonly field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "LlmPiiError";
    this.field = field;
  }
}

/** Thrown when every provider/retry is exhausted or a circuit is open (M6.4). */
export class LlmUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
}
