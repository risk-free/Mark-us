/**
 * Corpus freshness (mandate M7.1).
 *
 * Freshness is derived from the newest *completed* ingest run, never from a
 * table scan. ARCH-01 §13 / M7.1: `/tm/search` must report `stale` once the
 * corpus is older than the SLA (default 26 h — one daily cycle plus a 2 h grace).
 * Pure and clock-injected, so the boundary is unit-tested.
 */

export type CorpusFreshnessStatus = "fresh" | "stale" | "unknown";

export interface CorpusFreshness {
  status: CorpusFreshnessStatus;
  lastCompletedAt: Date | null;
  ageHours: number | null;
  slaHours: number;
}

export const DEFAULT_FRESHNESS_SLA_HOURS = 26;

export function corpusFreshness(
  lastCompletedAt: Date | null | undefined,
  now: Date,
  slaHours: number = DEFAULT_FRESHNESS_SLA_HOURS,
): CorpusFreshness {
  if (!lastCompletedAt) {
    return { status: "unknown", lastCompletedAt: null, ageHours: null, slaHours };
  }
  const ageHours = (now.getTime() - lastCompletedAt.getTime()) / 3_600_000;
  return {
    status: ageHours > slaHours ? "stale" : "fresh",
    lastCompletedAt,
    ageHours,
    slaHours,
  };
}
