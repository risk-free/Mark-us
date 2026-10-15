import { loadKb, KB_LOCALES } from "@markus/kb";
import { scanText } from "@markus/llm-gateway";

import { PII_CASES, RETRIEVAL_CASES } from "./datasets.js";

describe("RETRIEVAL_CASES", () => {
  const topics = new Set(loadKb().entries().map((entry) => entry.topic));

  test("is large enough to be a meaningful gate", () => {
    expect(RETRIEVAL_CASES.length).toBeGreaterThanOrEqual(14);
  });

  test("every expected topic exists in the KB", () => {
    for (const testCase of RETRIEVAL_CASES) {
      for (const topic of testCase.expectedTopics) {
        expect(topics.has(topic)).toBe(true);
      }
    }
  });

  test("every case expects at least one topic", () => {
    for (const testCase of RETRIEVAL_CASES) {
      expect(testCase.expectedTopics.length).toBeGreaterThan(0);
    }
  });

  test("no retrieval query contains a PII pattern", () => {
    for (const testCase of RETRIEVAL_CASES) {
      expect(scanText(testCase.query)).toBeNull();
    }
  });

  test("covers all three product locales", () => {
    const locales = new Set(RETRIEVAL_CASES.map((testCase) => testCase.locale));
    for (const locale of KB_LOCALES) {
      expect(locales.has(locale)).toBe(true);
    }
  });

  test("case ids are unique", () => {
    const ids = RETRIEVAL_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("PII_CASES", () => {
  test("case ids are unique", () => {
    const ids = PII_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every case expects rejection", () => {
    for (const testCase of PII_CASES) {
      expect(testCase.expect).toBe("reject");
    }
  });

  test("named vectors are present", () => {
    const kinds = new Set(PII_CASES.map((testCase) => testCase.kind));
    for (const kind of ["email", "phone", "wechat", "contactId", "denylistedKey", "injection"]) {
      expect(kinds.has(kind as (typeof PII_CASES)[number]["kind"])).toBe(true);
    }
  });
});
