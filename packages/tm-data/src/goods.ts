/**
 * Goods/services textual similarity (P5.3).
 *
 * A cheap, deterministic Dice coefficient over normalised tokens of the
 * goods/services description. It is a supporting feature only — free-text
 * overlap never overrides class adjacency, and the score is never rendered as a
 * probability (M7.2/M6.2).
 */

const STOPWORDS = new Set(["and", "or", "of", "the", "for", "in", "with", "a", "an", "to", "by", "on"]);

/** Lowercase, strip punctuation, drop stopwords and tokens shorter than 3 chars. */
export function normalizeGoods(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/** Dice coefficient over the token sets of two goods descriptions, `0..1`. */
export function goodsSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = new Set(normalizeGoods(a ?? ""));
  const right = new Set(normalizeGoods(b ?? ""));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }

  return (2 * shared) / (left.size + right.size);
}
