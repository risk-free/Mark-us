import { deriveSuggestions, type SuggestionInput } from "./suggest.js";

const base = (overrides: Partial<SuggestionInput> = {}): SuggestionInput => ({
  candidateCount: 3,
  maxTrigram: 0.5,
  maxPhonetic: 0.5,
  minClassDistance: 0,
  goodsMax: 0.5,
  degraded: false,
  ...overrides,
});

describe("deriveSuggestions (P5.5 / M6.2)", () => {
  test("degrades to INSUFFICIENT_DATA without a comparable corpus (M6.4)", () => {
    const result = deriveSuggestions(base({ candidateCount: 0, degraded: true }));
    expect(result.headlineConfidence).toBe("INSUFFICIENT_DATA");
    expect(result.riskFlags).toEqual(["INSUFFICIENT_CORPUS"]);
    expect(result.recommendedNextActions.length).toBeGreaterThan(0);
  });

  test("flags a class-relevant collision and bands strong overlap HIGH", () => {
    const result = deriveSuggestions(base({ maxTrigram: 0.9, maxPhonetic: 0.5 }));
    expect(result.riskFlags).toContain("LIKELY_CONFLICT");
    expect(result.headlineConfidence).toBe("HIGH");
  });

  test("bands a phonetic collision MEDIUM even across classes", () => {
    const result = deriveSuggestions(base({ maxTrigram: 0.2, maxPhonetic: 0.9, minClassDistance: 2 }));
    expect(result.riskFlags).toContain("LIKELY_CONFLICT");
    expect(result.headlineConfidence).toBe("MEDIUM");
    expect(result.recommendedNextActions).toContain(
      "Confirm the Nice class coverage matches the goods/services.",
    );
  });

  test("bands weak signals LOW with no collision flag", () => {
    const result = deriveSuggestions(base({ maxTrigram: 0.35, maxPhonetic: 0.3 }));
    expect(result.riskFlags).not.toContain("LIKELY_CONFLICT");
    expect(result.headlineConfidence).toBe("LOW");
  });

  test("prompts a clearer goods/services description when overlap is shallow", () => {
    const result = deriveSuggestions(base({ goodsMax: 0.05 }));
    expect(result.recommendedNextActions).toContain(
      "Describe the goods/services more precisely to sharpen the comparison.",
    );
  });

  test("always recommends attorney review and is deterministic", () => {
    const input = base({ maxTrigram: 0.9 });
    const first = deriveSuggestions(input);
    const second = deriveSuggestions(input);
    expect(first.recommendedNextActions).toContain(
      "Have a qualified trademark attorney review the result before filing.",
    );
    expect(second).toEqual(first);
  });
});
