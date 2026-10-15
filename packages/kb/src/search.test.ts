import { KB_ENTRIES } from "./entries.js";
import {
  DEFAULT_SEARCH_LIMIT,
  KbIndex,
  loadKb,
  searchKb,
  tokenize,
} from "./search.js";
import type { KbEntry } from "./types.js";

describe("tokenize", () => {
  test("lower-cases and splits ASCII words", () => {
    expect(tokenize("Likelihood of Confusion!")).toEqual([
      "likelihood",
      "of",
      "confusion",
    ]);
  });

  test("emits CJK unigrams and bigrams so an unspaced language is searchable", () => {
    expect(tokenize("尼斯分类")).toEqual(["尼", "斯", "分", "类", "尼斯", "斯分", "分类"]);
  });

  test("returns nothing for punctuation-only input", () => {
    expect(tokenize("  ---  ")).toEqual([]);
  });
});

describe("KbIndex", () => {
  test("loadKb indexes every curated entry and memoises the instance", () => {
    const index = loadKb();
    expect(index.size).toBe(KB_ENTRIES.length);
    expect(loadKb()).toBe(index);
  });

  test("ranks the most relevant passage first", () => {
    const hits = searchKb(loadKb(), "likelihood of confusion refusal section 2(d)");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.entry.id).toBe("en-tm-oa-2d");
    expect(hits[0]?.entry.section).toBe("office-actions");
  });

  test("is deterministic across repeated queries", () => {
    const index = loadKb();
    const first = searchKb(index, "specimen refusal").map((hit) => hit.entry.id);
    const second = searchKb(index, "specimen refusal").map((hit) => hit.entry.id);
    expect(first).toEqual(second);
  });

  test("returns no hits for an empty or unmatched query", () => {
    const index = loadKb();
    expect(searchKb(index, "")).toEqual([]);
    expect(searchKb(index, "zzzzqqqqxxxx")).toEqual([]);
  });

  test("caps results at the configured limit", () => {
    const hits = searchKb(loadKb(), "class goods services", { limit: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(DEFAULT_SEARCH_LIMIT).toBeGreaterThanOrEqual(3);
  });

  test("prefers the requested locale when both a translation and the original match", () => {
    const index = loadKb();
    expect(searchKb(index, "尼斯分类", { locale: "zh-CN" })[0]?.entry.id).toBe("zh-CN-tm-nice");
    expect(searchKb(index, "尼斯分類", { locale: "zh-TW" })[0]?.entry.id).toBe("zh-TW-tm-nice");
  });

  test("falls back to the English original when the locale has no matching copy", () => {
    const hits = searchKb(loadKb(), "likelihood of confusion", { locale: "zh-CN" });
    expect(hits[0]?.entry.lang).toBe("en");
  });

  test("never returns two entries for the same topic (translations do not double up)", () => {
    const hits = searchKb(loadKb(), "尼斯 classification", { locale: "zh-CN", limit: 10 });
    const topics = hits.map((hit) => hit.entry.topic);
    expect(new Set(topics).size).toBe(topics.length);
  });

  test("respects an explicit minScore", () => {
    const index = new KbIndex([
      {
        id: "x",
        topic: "x",
        section: "basics",
        lang: "en",
        title: "Alpha",
        url: "https://example.test/a",
        text: "alpha beta",
      } satisfies KbEntry,
    ]);
    expect(searchKb(index, "alpha", { minScore: 1_000 })).toEqual([]);
  });
});
