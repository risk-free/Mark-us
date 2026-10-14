/**
 * Label assembly for the probability model (P5.4, mandates M6.1/M6.5, ADRs D-24/D-26).
 *
 * The labelled set is the training/evaluation truth for `P(eventual registration)`:
 *
 *  - **positive**  — registered within the horizon (`registrationDate <= horizon`);
 *  - **negative**  — a verified abandonment event within the horizon
 *    (`abandonDate <= horizon`); the TDXF event history is the correct source (D-26 §3),
 *    not the research status codes;
 *  - **censored**  — unresolved at the horizon, or the horizon has not elapsed. A
 *    still-pending mark is **never** a negative (D-24).
 *
 * The horizon is +12 months primary / +24 months secondary (D-26) and lives in
 * configuration. Rows are structural so the store can map Prisma output without a
 * generated-client dependency.
 */

export interface OutcomeRow {
  serialNumber: string;
  filingDate: Date;
  registrationDate: Date | null;
  abandonDate: Date | null;
  statusCode: string;
}

export type Label = "positive" | "negative" | "censored";

const DAY_MS = 86_400_000;

const daysInMonthUtc = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** Calendar-correct month addition, clamping to the last day of the target month. */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonth = monthIndex + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  const clampedDay = Math.min(day, daysInMonthUtc(targetYear, normalizedMonth));
  const shifted = new Date(Date.UTC(targetYear, normalizedMonth, clampedDay));
  // Preserve any sub-day component (dates are stored day-granular, timestamps are not).
  return new Date(shifted.getTime() + (date.getTime() - Date.UTC(year, monthIndex, day)));
}

/** The label for one row at a given horizon; unresolved rows are censored. */
export function labelFor(row: OutcomeRow, censusAt: Date, horizonMonths: number): Label {
  const horizon = addMonths(row.filingDate, horizonMonths);
  void censusAt;

  if (row.registrationDate !== null && row.registrationDate.getTime() <= horizon.getTime()) {
    return "positive";
  }
  if (row.abandonDate !== null && row.abandonDate.getTime() <= horizon.getTime()) {
    return "negative";
  }
  return "censored";
}

export interface AssembledLabelSet {
  labeled: Array<{ row: OutcomeRow; label: "positive" | "negative" }>;
  censored: number;
  /** Positives / labeled length (0 when empty). */
  baseRate: number;
}

/** Partition rows into resolved labels plus a censored count (D-24). */
export function assembleLabelSet(
  rows: readonly OutcomeRow[],
  censusAt: Date,
  horizonMonths: number,
): AssembledLabelSet {
  const labeled: AssembledLabelSet["labeled"] = [];
  let censored = 0;

  for (const row of rows) {
    const label = labelFor(row, censusAt, horizonMonths);
    if (label === "censored") {
      censored += 1;
    } else {
      labeled.push({ row, label });
    }
  }

  const positives = labeled.filter((entry) => entry.label === "positive").length;
  return {
    labeled,
    censored,
    baseRate: labeled.length === 0 ? 0 : positives / labeled.length,
  };
}

/**
 * Temporal split for M6.5/D-25: rows dated strictly before `cutoff` train, rows
 * at or after it form the held-out split. Feature and label windows are separated
 * by construction (the caller chooses disjoint windows).
 */
export function temporalSplit<T>(
  rows: readonly T[],
  cutoff: Date,
  dateOf: (row: T) => Date,
): { train: T[]; holdout: T[] } {
  const train: T[] = [];
  const holdout: T[] = [];
  for (const row of rows) {
    if (dateOf(row).getTime() < cutoff.getTime()) {
      train.push(row);
    } else {
      holdout.push(row);
    }
  }
  return { train, holdout };
}

export { DAY_MS };
