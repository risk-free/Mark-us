import { phoneticKey, phoneticSimilarity, phoneticTokens } from "./phonetic.js";

describe("phoneticKey", () => {
  test("matches the canonical Soundex examples", () => {
    expect(phoneticKey("Robert")).toBe("R163");
    expect(phoneticKey("Rupert")).toBe("R163");
    expect(phoneticKey("Rubin")).toBe("R150");
    expect(phoneticKey("Ashcraft")).toBe("A261");
    expect(phoneticKey("Tymczak")).toBe("T522");
    expect(phoneticKey("Pfister")).toBe("P236");
  });

  test("is case-insensitive and ignores non-letters", () => {
    expect(phoneticKey("robert")).toBe(phoneticKey("ROBERT"));
    expect(phoneticKey("Ro-bert 2")).toBe(phoneticKey("Robert"));
    expect(phoneticKey("ACME CORP")).toBe(phoneticKey("ACMECORP"));
  });

  test("returns the empty string when there are no letters", () => {
    expect(phoneticKey("   ")).toBe("");
    expect(phoneticKey("123-456")).toBe("");
  });
});

describe("phoneticTokens", () => {
  test("produces one key per word with letters", () => {
    expect(phoneticTokens("Acme Corp")).toEqual(["A250", "C610"]);
  });

  test("skips words without letters", () => {
    expect(phoneticTokens("24 Acme")).toEqual(phoneticTokens("Acme"));
  });
});

describe("phoneticSimilarity", () => {
  test("is 1 for identical non-empty input", () => {
    expect(phoneticSimilarity("Acme", "AcMe")).toBe(1);
    expect(phoneticSimilarity("Acme Corp", "Acme Corp")).toBe(1);
  });

  test("is symmetric", () => {
    const forward = phoneticSimilarity("Acme Corp", "Akme Corp");
    const backward = phoneticSimilarity("Akme Corp", "Acme Corp");
    expect(forward).toBe(backward);
  });

  test("rates a homeophone phrase highly", () => {
    expect(phoneticSimilarity("Acme Corp", "Akme Corp")).toBe(1);
    expect(phoneticSimilarity("Robert", "Rupert")).toBe(1);
  });

  test("is 0 for disjoint marks and for empty input", () => {
    expect(phoneticSimilarity("Acme", "Zebra")).toBe(0);
    expect(phoneticSimilarity("Acme", "")).toBe(0);
    expect(phoneticSimilarity("123", "456")).toBe(0);
  });

  test("keeps a partial score for a shared word", () => {
    const score = phoneticSimilarity("Acme Corp", "Acme Widgets");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
