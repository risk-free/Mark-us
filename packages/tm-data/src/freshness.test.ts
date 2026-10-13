import { corpusFreshness, DEFAULT_FRESHNESS_SLA_HOURS } from "./freshness.js";

const now = new Date("2026-10-13T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("corpusFreshness", () => {
  test("unknown when the corpus has never completed a run", () => {
    expect(corpusFreshness(null, now)).toEqual({
      status: "unknown",
      lastCompletedAt: null,
      ageHours: null,
      slaHours: DEFAULT_FRESHNESS_SLA_HOURS,
    });
  });

  test("fresh within the SLA", () => {
    const result = corpusFreshness(hoursAgo(25), now);
    expect(result.status).toBe("fresh");
    expect(result.ageHours).toBeCloseTo(25);
  });

  test("exactly at the SLA is still fresh", () => {
    expect(corpusFreshness(hoursAgo(26), now).status).toBe("fresh");
  });

  test("stale beyond the SLA (M7.1 gate)", () => {
    const result = corpusFreshness(hoursAgo(26.5), now);
    expect(result.status).toBe("stale");
    expect(result.slaHours).toBe(26);
  });

  test("honours a custom SLA", () => {
    expect(corpusFreshness(hoursAgo(2), now, 1).status).toBe("stale");
  });
});
