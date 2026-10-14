import { goodsSimilarity, normalizeGoods } from "./goods.js";

describe("normalizeGoods", () => {
  test("lowercases, strips punctuation, drops stopwords and short tokens", () => {
    expect(normalizeGoods("T-shirts, shoes & hats!")).toEqual(["shirts", "shoes", "hats"]);
    expect(normalizeGoods("The best of a good thing")).toEqual(["best", "good", "thing"]);
  });

  test("returns an empty list for blank input", () => {
    expect(normalizeGoods("   ")).toEqual([]);
  });
});

describe("goodsSimilarity", () => {
  test("is 1 for identical descriptions", () => {
    expect(goodsSimilarity("clothing, footwear, headgear", "clothing footwear headgear")).toBe(1);
  });

  test("is 0 for disjoint or empty descriptions", () => {
    expect(goodsSimilarity("clothing footwear", "software services")).toBe(0);
    expect(goodsSimilarity(null, "clothing")).toBe(0);
    expect(goodsSimilarity("", "")).toBe(0);
  });

  test("is symmetric and partial for overlap", () => {
    const a = "clothing, footwear, headgear";
    const b = "clothing, headgear";
    expect(goodsSimilarity(a, b)).toBe(goodsSimilarity(b, a));
    expect(goodsSimilarity(a, b)).toBeGreaterThan(0);
    expect(goodsSimilarity(a, b)).toBeLessThan(1);
  });
});
