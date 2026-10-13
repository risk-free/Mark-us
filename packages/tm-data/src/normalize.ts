/**
 * Text normalisation for `TmCorpusMark.normalizedText` (ARCH-02 §4.2.4).
 *
 * The trigram index (`pg_trgm`, GIN) is built on this column, so normalisation
 * must happen once, at ingest — never as `ILIKE` at query time. The transform is
 * intentionally conservative and deterministic: NFD-decompose, strip combining
 * marks (accents), lowercase, drop everything but `[a-z0-9]` and spaces, and
 * collapse runs of whitespace. Aggressive stemming is deliberately out of scope:
 * the similarity method (M7.2) is chosen from measured golden-set recall, and a
 * lossy normaliser would silently change that recall.
 */
export function normalizeMarkText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
