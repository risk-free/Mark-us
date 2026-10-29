/**
 * Phonetic similarity for the similarity engine (P5.3).
 *
 * American Soundex over the alphabetic characters of a mark. The engine treats
 * phonetic agreement as one weighted **feature** in the `/tm/search` hybrid,
 * alongside trigram and Nice-class adjacency; assessment scoring can also reuse
 * it as a non-probabilistic sub-signal.
 */

const CODES: Record<string, string> = {
  B: "1", F: "1", P: "1", V: "1",
  C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
  D: "3", T: "3",
  L: "4",
  M: "5", N: "5",
  R: "6",
};

const VOWELS = new Set(["A", "E", "I", "O", "U", "Y"]);

/**
 * Soundex key (4 chars) of the whole string. Standard rules: keep the first
 * letter, collapse runs of the same code, skip `H`/`W` without resetting the
 * previous code, and let vowels reset it. Alphabetic-only input, else `""`.
 */
export function phoneticKey(text: string): string {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length === 0) return "";

  const first = letters[0]!;
  let result = first;
  let previous = CODES[first] ?? "0";

  for (let i = 1; i < letters.length; i += 1) {
    const letter = letters[i]!;
    if (letter === "H" || letter === "W") continue;

    const code = VOWELS.has(letter) ? "0" : (CODES[letter] ?? "0");
    if (code !== "0" && code !== previous) {
      result += code;
      if (result.length === 4) break;
    }
    previous = code;
  }

  return result.padEnd(4, "0");
}

/** One Soundex key per word containing at least one letter. */
export function phoneticTokens(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word))
    .map((word) => phoneticKey(word))
    .filter((key) => key.length > 0);
}

const multisetDice = (a: readonly string[], b: readonly string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const key of a) counts.set(key, (counts.get(key) ?? 0) + 1);

  let shared = 0;
  for (const key of b) {
    const remaining = counts.get(key) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(key, remaining - 1);
    }
  }

  return (2 * shared) / (a.length + b.length);
};

/**
 * Phonetic similarity in `0..1`: `1` for identical non-empty input, `0` when
 * either side has no letters, otherwise the greater of the whole-string key
 * match and the per-word key Dice coefficient. Symmetric.
 */
export function phoneticSimilarity(a: string, b: string): number {
  if (!/[A-Za-z]/.test(a) || !/[A-Za-z]/.test(b)) return 0;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return 1;

  const wholeMatch = phoneticKey(a) === phoneticKey(b) ? 1 : 0;
  const tokenMatch = multisetDice(phoneticTokens(a), phoneticTokens(b));
  return Math.max(wholeMatch, tokenMatch);
}
