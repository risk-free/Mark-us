/**
 * USPTO knowledge base + RAG (P6.2) — `@markus/kb`.
 *
 * A curated, public, non-PII KB with deterministic lexical search and a small
 * retrieval-augmented answering pipeline that talks to the model only through
 * `@markus/llm-gateway`. The design honours the P6 mandates:
 *
 *  - M6.3 / D-04: only mark text, class, jurisdiction and business description
 *    enter a prompt; the gateway's PII guard runs before any network call.
 *  - M6.4: an LLM outage degrades to cited references with no generated answer.
 *  - D-15: retrieval is lexical and in-memory; no corpus-wide vectors persist.
 */

export { KB_ENTRIES } from "./entries.js";
export {
  KB_LOCALES,
  resolveKbLocale,
} from "./types.js";
export type { KbEntry, KbLocale, KbSection } from "./types.js";

export {
  DEFAULT_SEARCH_LIMIT,
  KbIndex,
  loadKb,
  searchKb,
  tokenize,
} from "./search.js";
export type { KbSearchHit, KbSearchOptions } from "./search.js";

export {
  buildRagMessages,
  buildSystemPrompt,
  buildUserPrompt,
  DEFAULT_PROMPT_LOCALE,
  RAG_PROMPT_VERSION,
} from "./prompts.js";
export type { PromptContext, PromptSource } from "./prompts.js";

export {
  RAG_DEFAULT_TOP_K,
  RAG_MAX_TOP_K,
  RAG_MIN_TOP_K,
  RagPipeline,
} from "./rag.js";
export type {
  ChatClient,
  RagAnswer,
  RagAnswerDegraded,
  RagAnswerSuccess,
  RagCitation,
  RagInput,
  RagOptions,
  RagPipelineOptions,
} from "./rag.js";
