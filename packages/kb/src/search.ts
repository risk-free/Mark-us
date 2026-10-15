/**
 * Deterministic KB retrieval (P6.2).
 *
 * A small, dependency-free BM25 index. Documents are tokenised with an
 * ASCII-word pass plus CJK unigrams and bigrams, so a Chinese query retrieves
 * Chinese entries even though the language has no spaces. Titles are boosted,
 * the scoring is fully deterministic, and results are de-duplicated by logical
 * `topic` so translations of one fact never consume two citation slots. No
 * external vectors are persisted: retrieval is lexical here, and any embedding
 * work stays on demand through the gateway (D-15).
 */

import { KB_ENTRIES } from "./entries.js";
import { resolveKbLocale, type KbEntry, type KbLocale } from "./types.js";

/** BM25 term-frequency saturation. */
const BM25_K1 = 1.2;
/** BM25 length normalisation. */
const BM25_B = 0.75;
/** Title terms count for more than body terms. */
const TITLE_BOOST = 3;

export const DEFAULT_SEARCH_LIMIT = 5;

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;
const WORD_PATTERN = /[a-z0-9]/;

/**
 * Tokenise text to lower-case ASCII words plus CJK unigrams and bigrams.
 * Deterministic and locale-agnostic (no ICU dependency).
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  let index = 0;
  while (index < lower.length) {
    const char = lower.charAt(index);
    if (CJK_PATTERN.test(char)) {
      const run: string[] = [];
      while (index < lower.length && CJK_PATTERN.test(lower.charAt(index))) {
        run.push(lower.charAt(index));
        index += 1;
      }
      for (const unit of run) tokens.push(unit);
      for (let i = 0; i + 1 < run.length; i += 1) tokens.push(`${run[i]}${run[i + 1]}`);
      continue;
    }
    if (WORD_PATTERN.test(char)) {
      const start = index;
      while (index < lower.length && WORD_PATTERN.test(lower.charAt(index))) index += 1;
      tokens.push(lower.slice(start, index));
      continue;
    }
    index += 1;
  }
  return tokens;
}

interface IndexedDoc {
  entry: KbEntry;
  termFrequency: Map<string, number>;
  length: number;
}

export interface KbSearchOptions {
  /** Caller locale; localised entries are preferred over their fallback. */
  locale?: string;
  /** Maximum number of hits; defaults to {@link DEFAULT_SEARCH_LIMIT}. */
  limit?: number;
  /** Drop hits scoring at or below this value; defaults to 0 (strictly positive). */
  minScore?: number;
}

export interface KbSearchHit {
  entry: KbEntry;
  score: number;
}

const addTerm = (map: Map<string, number>, term: string, count: number): void => {
  map.set(term, (map.get(term) ?? 0) + count);
};

const buildDoc = (entry: KbEntry): IndexedDoc => {
  const termFrequency = new Map<string, number>();
  for (const term of tokenize(entry.text)) addTerm(termFrequency, term, 1);
  for (const term of tokenize(entry.section)) addTerm(termFrequency, term, 1);
  for (const term of tokenize(entry.title)) addTerm(termFrequency, term, TITLE_BOOST);
  let length = 0;
  for (const count of termFrequency.values()) length += count;
  return { entry, termFrequency, length };
};

const localeRank = (preferred: KbLocale): Map<string, number> => {
  const order: KbLocale[] = [preferred, ...(["en", "zh-CN", "zh-TW"] as KbLocale[]).filter(
    (locale) => locale !== preferred,
  )];
  return new Map(order.map((locale, index) => [locale, index]));
};

/** In-memory BM25 index over a fixed set of {@link KbEntry}. */
export class KbIndex {
  readonly #docs: IndexedDoc[];
  readonly #documentFrequency: Map<string, number>;
  readonly #averageLength: number;

  constructor(entries: readonly KbEntry[]) {
    this.#docs = entries.map(buildDoc);
    this.#documentFrequency = new Map();
    for (const doc of this.#docs) {
      for (const term of doc.termFrequency.keys()) {
        this.#documentFrequency.set(term, (this.#documentFrequency.get(term) ?? 0) + 1);
      }
    }
    const totalLength = this.#docs.reduce((sum, doc) => sum + doc.length, 0);
    this.#averageLength = this.#docs.length === 0 ? 0 : totalLength / this.#docs.length;
  }

  get size(): number {
    return this.#docs.length;
  }

  entries(): KbEntry[] {
    return this.#docs.map((doc) => doc.entry);
  }

  search(query: string, options: KbSearchOptions = {}): KbSearchHit[] {
    if (this.#docs.length === 0) return [];
    const limit = Math.max(0, options.limit ?? DEFAULT_SEARCH_LIMIT);
    if (limit === 0) return [];
    const minScore = options.minScore ?? 0;

    const queryTerms = new Map<string, number>();
    for (const term of tokenize(query)) addTerm(queryTerms, term, 1);
    if (queryTerms.size === 0) return [];

    const ranks = localeRank(resolveKbLocale(options.locale));
    const byTopic = new Map<string, KbSearchHit>();

    for (const doc of this.#docs) {
      const score = this.#score(doc, queryTerms);
      if (!(score > minScore)) continue;
      const candidate: KbSearchHit = { entry: doc.entry, score };
      const existing = byTopic.get(doc.entry.topic);
      if (existing === undefined) {
        byTopic.set(doc.entry.topic, candidate);
        continue;
      }
      const existingRank = ranks.get(existing.entry.lang) ?? Number.MAX_SAFE_INTEGER;
      const candidateRank = ranks.get(doc.entry.lang) ?? Number.MAX_SAFE_INTEGER;
      if (
        candidateRank < existingRank ||
        (candidateRank === existingRank && candidate.score > existing.score)
      ) {
        byTopic.set(doc.entry.topic, candidate);
      }
    }

    return [...byTopic.values()]
      .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
      .slice(0, limit);
  }

  #score(doc: IndexedDoc, queryTerms: ReadonlyMap<string, number>): number {
    const documentCount = this.#docs.length;
    const lengthNorm =
      this.#averageLength === 0 ? 1 : doc.length / this.#averageLength;
    let score = 0;
    for (const [term, queryFrequency] of queryTerms) {
      const frequency = doc.termFrequency.get(term);
      if (frequency === undefined) continue;
      const df = this.#documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
      const denominator = frequency + BM25_K1 * (1 - BM25_B + BM25_B * lengthNorm);
      score += idf * ((frequency * (BM25_K1 + 1)) / denominator) * queryFrequency;
    }
    return score;
  }
}

/** Convenience wrapper around {@link KbIndex.search}. */
export function searchKb(
  index: KbIndex,
  query: string,
  options: KbSearchOptions = {},
): KbSearchHit[] {
  return index.search(query, options);
}

let cachedIndex: KbIndex | undefined;

/** The process-wide index over the curated entries. Built once, then memoised. */
export function loadKb(): KbIndex {
  cachedIndex ??= new KbIndex(KB_ENTRIES);
  return cachedIndex;
}
