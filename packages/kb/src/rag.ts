/**
 * Retrieval-augmented answering (P6.2, mandates M6.3/M6.4).
 *
 * `RagPipeline.answer` retrieves the top KB passages for a minimised query,
 * cites them by index/title/url, and asks the gateway. Two M6 guarantees are
 * structural:
 *
 *  - M6.3: the only client inputs accepted are mark text, class, jurisdiction
 *    and business description; the gateway's own PII guard is the second line
 *    of defence and runs before any network call.
 *  - M6.4: an LLM outage is caught as `LlmUnavailableError` and returned as
 *    `{ status: "degraded", citations }` with **no** generated text, so nothing
 *    fabricated ever reaches a user.
 *
 * Embeddings are intentionally not used: retrieval is lexical (D-15 keeps
 * vector work on demand and unpersisted), so `embed()` is never on this path.
 */

import { LlmUnavailableError, type ChatMessage, type ChatOptions, type ChatResult, type LlmTask } from "@markus/llm-gateway";

import { buildRagMessages, type PromptSource } from "./prompts.js";
import { loadKb, type KbIndex, type KbSearchHit } from "./search.js";
import { resolveKbLocale, type KbLocale } from "./types.js";

/** The subset of `LlmGateway` the pipeline needs; `LlmGateway` satisfies it. */
export interface ChatClient {
  chat(
    messages: ChatMessage[],
    opts?: ChatOptions & { context?: Record<string, unknown> },
  ): Promise<ChatResult>;
}

export interface RagInput {
  markText: string;
  classCodes?: readonly number[];
  jurisdiction?: string;
  businessDescription?: string;
  locale?: string;
}

export interface RagCitation {
  index: number;
  id: string;
  title: string;
  section: string;
  url: string;
  lang: KbLocale;
}

export interface RagAnswerSuccess {
  status: "ok";
  answer: string;
  citations: RagCitation[];
  locale: KbLocale;
  provider: string;
  model: string;
}

/** M6.4 fallback: retrieval citations survive, but no answer is invented. */
export interface RagAnswerDegraded {
  status: "degraded";
  citations: RagCitation[];
  locale: KbLocale;
  code: "llm_unavailable";
  reason: string;
}

export type RagAnswer = RagAnswerSuccess | RagAnswerDegraded;

export interface RagOptions {
  /** Passages to retrieve; clamped to {@link RAG_MIN_TOP_K}..{@link RAG_MAX_TOP_K}. */
  topK?: number;
  task?: LlmTask;
  temperature?: number;
  maxTokens?: number;
}

export const RAG_MIN_TOP_K = 3;
export const RAG_MAX_TOP_K = 5;
export const RAG_DEFAULT_TOP_K = 4;

const clampTopK = (value: number | undefined): number => {
  if (value === undefined || !Number.isFinite(value)) return RAG_DEFAULT_TOP_K;
  return Math.min(RAG_MAX_TOP_K, Math.max(RAG_MIN_TOP_K, Math.trunc(value)));
};

/** Lexical query from the permitted fields only (no PII, no mark-owner data). */
const buildQuery = (input: RagInput): string => {
  const parts: string[] = [input.markText];
  if (input.jurisdiction !== undefined && input.jurisdiction !== "") parts.push(input.jurisdiction);
  if (input.classCodes !== undefined && input.classCodes.length > 0) {
    parts.push(`class ${input.classCodes.join(" ")}`);
  }
  if (input.businessDescription !== undefined && input.businessDescription !== "") {
    parts.push(input.businessDescription);
  }
  return parts.join("\n");
};

const toCitation = (hit: KbSearchHit, index: number): RagCitation => ({
  index,
  id: hit.entry.id,
  title: hit.entry.title,
  section: hit.entry.section,
  url: hit.entry.url,
  lang: hit.entry.lang,
});

const toSource = (hit: KbSearchHit, index: number): PromptSource => ({
  index,
  title: hit.entry.title,
  url: hit.entry.url,
  text: hit.entry.text,
});

export interface RagPipelineOptions {
  /** Override the KB index (defaults to the memoised {@link loadKb}). */
  index?: KbIndex;
  /** Default gateway task; defaults to `chatbot`. */
  task?: LlmTask;
}

export class RagPipeline {
  readonly #gateway: ChatClient;
  readonly #index: KbIndex;
  readonly #task: LlmTask;

  constructor(gateway: ChatClient, options: RagPipelineOptions = {}) {
    this.#gateway = gateway;
    this.#index = options.index ?? loadKb();
    this.#task = options.task ?? "chatbot";
  }

  /** Retrieve the top passages for `input`; exposed for callers and tests. */
  retrieve(input: RagInput, topK?: number): KbSearchHit[] {
    return this.#index.search(buildQuery(input), {
      locale: input.locale,
      limit: clampTopK(topK),
    });
  }

  async answer(input: RagInput, options: RagOptions = {}): Promise<RagAnswer> {
    const locale = resolveKbLocale(input.locale);
    const hits = this.retrieve(input, options.topK);
    const citations = hits.map((hit, index) => toCitation(hit, index + 1));
    const sources = hits.map((hit, index) => toSource(hit, index + 1));
    const messages = buildRagMessages({ ...input, locale, sources });

    try {
      const result = await this.#gateway.chat(messages, {
        task: options.task ?? this.#task,
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      });
      return {
        status: "ok",
        answer: result.content,
        citations,
        locale,
        provider: result.provider,
        model: result.usage.model,
      };
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        return {
          status: "degraded",
          citations,
          locale,
          code: "llm_unavailable",
          reason: error.message,
        };
      }
      throw error;
    }
  }
}
