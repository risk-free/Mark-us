import type { QueryMark } from "@markus/tm-data";

import { assessmentCacheKey, InMemoryAssessmentCache } from "./assessment-cache.js";

const base: QueryMark = { markText: "ACME", classCodes: [9], goodsSummary: "software service" };

describe("assessmentCacheKey", () => {
  test("is stable across mark case and whitespace", () => {
    const spaced: QueryMark = { ...base, markText: "  acme   " };
    expect(assessmentCacheKey(spaced, "bootstrap-0.1.0", "disclaimer-1.0.0")).toBe(
      assessmentCacheKey(base, "bootstrap-0.1.0", "disclaimer-1.0.0"),
    );
  });

  test("ignores class-code order", () => {
    const a: QueryMark = { ...base, classCodes: [25, 9] };
    const b: QueryMark = { ...base, classCodes: [9, 25] };
    expect(assessmentCacheKey(a, "m", "d")).toBe(assessmentCacheKey(b, "m", "d"));
  });

  test("ignores goods token order and case", () => {
    const a: QueryMark = { ...base, goodsSummary: "software service" };
    const b: QueryMark = { ...base, goodsSummary: "Service Software" };
    expect(assessmentCacheKey(a, "m", "d")).toBe(assessmentCacheKey(b, "m", "d"));
  });

  test("treats null goods as a stable sentinel distinct from text", () => {
    const none: QueryMark = { ...base, goodsSummary: null };
    expect(assessmentCacheKey(none, "m", "d")).not.toBe(assessmentCacheKey(base, "m", "d"));
    expect(assessmentCacheKey(none, "m", "d")).toBe(
      assessmentCacheKey({ ...base, goodsSummary: null }, "m", "d"),
    );
  });

  test("changes when the model or disclaimer version changes", () => {
    expect(assessmentCacheKey(base, "model-a", "d")).not.toBe(assessmentCacheKey(base, "model-b", "d"));
    expect(assessmentCacheKey(base, "m", "d1")).not.toBe(assessmentCacheKey(base, "m", "d2"));
  });

  test("is prefixed and hex-encoded sha256 over delimiter-safe fields", () => {
    const key = assessmentCacheKey(base, "m", "d");
    expect(key.startsWith("markus:assess:v1:")).toBe(true);
    expect(key.slice("markus:assess:v1:".length)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("InMemoryAssessmentCache", () => {
  test("round-trips a value until the TTL elapses", async () => {
    let now = 0;
    const cache = new InMemoryAssessmentCache(() => now);

    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBe("v");

    now = 9_999;
    expect(await cache.get("k")).toBe("v");

    now = 10_000;
    expect(await cache.get("k")).toBeNull();
  });

  test("returns null for an unknown key", async () => {
    const cache = new InMemoryAssessmentCache();
    expect(await cache.get("missing")).toBeNull();
  });
});
