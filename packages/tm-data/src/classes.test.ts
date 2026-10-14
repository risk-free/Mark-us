import { areRelatedClasses, classAdjacency, closestClassDistance, NICE_RELATED_GROUPS, normalizeClass } from "./classes.js";

describe("normalizeClass", () => {
  test("parses numbers and numeric strings", () => {
    expect(normalizeClass(25)).toBe(25);
    expect(normalizeClass("25")).toBe(25);
    expect(normalizeClass("025")).toBe(25);
  });

  test("rejects out-of-range and non-numeric input", () => {
    expect(normalizeClass(0)).toBeNull();
    expect(normalizeClass(46)).toBeNull();
    expect(normalizeClass("abc")).toBeNull();
    expect(normalizeClass(2.5)).toBeNull();
  });
});

describe("classAdjacency", () => {
  test("identical classes are distance 0", () => {
    expect(classAdjacency(9, 9)).toEqual({ related: true, distance: 0 });
    expect(areRelatedClasses(9, 9)).toBe(true);
  });

  test("classes in a shared group are distance 1", () => {
    expect(classAdjacency(9, 42)).toEqual({ related: true, distance: 1 });
    expect(classAdjacency(9, 35)).toEqual({ related: true, distance: 1 });
    expect(classAdjacency(3, 5)).toEqual({ related: true, distance: 1 });
  });

  test("unrelated classes are distance 2", () => {
    expect(classAdjacency(1, 25)).toEqual({ related: false, distance: 2 });
    expect(areRelatedClasses(2, 40)).toBe(false);
  });

  test("invalid classes are treated as unrelated", () => {
    expect(classAdjacency(0, 9)).toEqual({ related: false, distance: 2 });
  });
});

describe("closestClassDistance", () => {
  test("returns the minimum distance over the candidate classes", () => {
    expect(closestClassDistance(9, [40, 42, 25])).toBe(1);
    expect(closestClassDistance(9, [9, 25])).toBe(0);
    expect(closestClassDistance(9, [15, 25])).toBe(2);
  });

  test("returns 2 for an empty list", () => {
    expect(closestClassDistance(9, [])).toBe(2);
  });
});

describe("NICE_RELATED_GROUPS", () => {
  test("contains only valid, unique classes per group", () => {
    for (const group of NICE_RELATED_GROUPS) {
      const seen = new Set<number>();
      for (const niceClass of group) {
        expect(niceClass).toBeGreaterThanOrEqual(1);
        expect(niceClass).toBeLessThanOrEqual(45);
        expect(seen.has(niceClass)).toBe(false);
        seen.add(niceClass);
      }
    }
  });
});
