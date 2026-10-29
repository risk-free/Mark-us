import type { CorpusSearchOptions, CorpusSqlClient } from "./search.js";
import type { CorpusTrainingRow } from "./train.js";
import { trainingSampleRank, type TrainingCorpusConfig } from "./training-config.js";
import {
  PrismaCorpusTrainingSource,
  type TrainingCorpusInstrumentation,
  type TrainingCorpusPageMetric,
  type TrainingCorpusSearcher,
  type TrainingCorpusSqlClient,
  type TrainingCorpusTransactionOptions,
} from "./training-corpus.js";

interface OutcomeFixture {
  serialNumber: string;
  markText: string;
  statusCode: string;
  filingDate: Date;
  registrationDate: Date | null;
  abandonDate: Date | null;
  goodsSummary: string | null;
  classCodes: number[];
}

const outcome = (serialNumber: string, filingDate: Date): OutcomeFixture => ({
  serialNumber,
  markText: `MARK ${serialNumber}`,
  statusCode: "700",
  filingDate,
  registrationDate: null,
  abandonDate: null,
  goodsSummary: "software",
  classCodes: [9],
});

const config = (overrides: Partial<TrainingCorpusConfig> = {}): TrainingCorpusConfig => ({
  cohort: "live-v1",
  seed: 0,
  batchSize: 2,
  maxExamples: 100,
  ...overrides,
});

const makeSql = (fixtures: readonly OutcomeFixture[], events?: string[]) => {
  const calls: unknown[][] = [];
  const statements: string[] = [];
  const transactions: TrainingCorpusTransactionOptions[] = [];
  const client: TrainingCorpusSqlClient = {
    async $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
      statements.push(strings.join("?"));
      calls.push(values);
      events?.push("sql");
      const censusAt = values[0] as Date;
      const afterDate = values[1] as Date | null;
      const afterSerialNumber = values[4] as string | null;
      const batchSize = values[5] as number;
      const rows = fixtures
        .filter(
          (row) =>
            row.filingDate.getTime() <= censusAt.getTime() &&
            ["6", "7"].includes(row.statusCode.slice(0, 1)),
        )
        .filter(
          (row) =>
            afterDate === null ||
            row.filingDate.getTime() > afterDate.getTime() ||
            (row.filingDate.getTime() === afterDate.getTime() &&
              row.serialNumber > afterSerialNumber!),
        )
        .sort(
          (left, right) =>
            left.filingDate.getTime() - right.filingDate.getTime() ||
            (left.serialNumber < right.serialNumber ? -1 : left.serialNumber > right.serialNumber ? 1 : 0),
        )
        .slice(0, batchSize);
      return rows as T;
    },
    async $transaction<T>(
      callback: (transaction: CorpusSqlClient) => Promise<T>,
      options: TrainingCorpusTransactionOptions,
    ): Promise<T> {
      transactions.push(options);
      events?.push("transaction:start");
      try {
        return await callback(client);
      } finally {
        events?.push("transaction:end");
      }
    },
  };
  return { client, calls, statements, transactions };
};

const makeSearcher = (events?: string[]) => {
  const calls: Array<{ query: string; options?: CorpusSearchOptions }> = [];
  const searcher: TrainingCorpusSearcher = {
    async search(query, options) {
      calls.push({ query, options });
      events?.push("search");
      return { candidates: [] };
    },
  };
  return { calls, searcher };
};

const collect = async (
  source: PrismaCorpusTrainingSource,
  censusAt: Date,
  corpus: TrainingCorpusConfig,
  instrumentation: TrainingCorpusInstrumentation = {},
): Promise<CorpusTrainingRow[]> => {
  const rows: CorpusTrainingRow[] = [];
  for await (const row of source.stream(censusAt, corpus, instrumentation)) rows.push(row);
  return rows;
};

const fixtures = (count: number): OutcomeFixture[] =>
  Array.from({ length: count }, (_, index) =>
    outcome(
      `serial-${String(index).padStart(2, "0")}`,
      new Date(Date.UTC(2020, Math.floor(index / 4), index % 4 + 1)),
    ),
  );

describe("PrismaCorpusTrainingSource bounded keyset streaming", () => {
  test("crosses tied filing-date page boundaries without duplicates or omissions", async () => {
    const tiedDate = new Date("2020-01-01T00:00:00.000Z");
    const rows = [
      outcome("100", tiedDate),
      outcome("101", tiedDate),
      outcome("102", tiedDate),
      outcome("103", new Date("2020-01-02T00:00:00.000Z")),
      outcome("104", new Date("2020-01-02T00:00:00.000Z")),
    ];
    const sql = makeSql(rows);
    const search = makeSearcher();
    const metrics: TrainingCorpusPageMetric[] = [];

    const streamed = await collect(
      new PrismaCorpusTrainingSource(sql.client, search.searcher),
      new Date("2022-01-01T00:00:00.000Z"),
      config({ batchSize: 2, maxExamples: 10 }),
      { onPage: (metric) => metrics.push(metric) },
    );

    expect(streamed.map((row) => row.serialNumber)).toEqual(["100", "101", "102", "103", "104"]);
    expect(new Set(streamed.map((row) => row.serialNumber)).size).toBe(rows.length);
    expect(metrics.map((metric) => metric.pageOutcomeRows)).toEqual([2, 2, 1]);
    expect(metrics.map((metric) => metric.bufferedOutcomeRows)).toEqual([4, 6, 6]);
    expect(sql.statements).toHaveLength(3);
    expect(sql.transactions).toEqual([
      { isolationLevel: "RepeatableRead", maxWait: 30_000, timeout: 3_600_000 },
    ]);
    expect(sql.statements[0]).toContain('ORDER BY m."filingDate" ASC, m."serialNumber" ASC');
    expect(sql.statements[0]).not.toMatch(/\bOFFSET\b/i);
    expect(sql.calls[1]?.[1]).toEqual(tiedDate);
    expect(sql.calls[1]?.[4]).toBe("101");
    expect(search.calls.map((call) => call.options?.excludeSerialNumber)).toEqual(
      rows.map((row) => row.serialNumber),
    );
    expect(search.calls.every((call) => call.options?.filedBefore instanceof Date)).toBe(true);
  });

  test("selects the same global top-N sample across batch sizes and changes it by seed", async () => {
    const rows = fixtures(37);
    const censusAt = new Date("2022-01-01T00:00:00.000Z");
    const sample = async (batchSize: number, seed: number) => {
      const sql = makeSql(rows);
      const search = makeSearcher();
      const streamed = await collect(
        new PrismaCorpusTrainingSource(sql.client, search.searcher),
        censusAt,
        config({ batchSize, seed, maxExamples: 7 }),
      );
      expect(search.calls).toHaveLength(7);
      return streamed.map((row) => row.serialNumber);
    };

    const expected = [...rows]
      .sort(
        (left, right) =>
          trainingSampleRank(left.serialNumber, 91) - trainingSampleRank(right.serialNumber, 91) ||
          left.serialNumber.localeCompare(right.serialNumber),
      )
      .slice(0, 7)
      .sort(
        (left, right) =>
          left.filingDate.getTime() - right.filingDate.getTime() ||
          left.serialNumber.localeCompare(right.serialNumber),
      )
      .map((row) => row.serialNumber);
    const one = await sample(1, 91);
    const three = await sample(3, 91);
    const eleven = await sample(11, 91);

    expect(one).toEqual(expected);
    expect(three).toEqual(expected);
    expect(eleven).toEqual(expected);
    expect(await sample(3, 92)).not.toEqual(expected);
  });

  test("finishes selection before retrieval and measures the page-plus-heap bound", async () => {
    const rows = fixtures(9);
    const events: string[] = [];
    const sql = makeSql(rows, events);
    const search = makeSearcher(events);
    const metrics: TrainingCorpusPageMetric[] = [];

    const streamed = await collect(
      new PrismaCorpusTrainingSource(sql.client, search.searcher),
      new Date("2022-01-01T00:00:00.000Z"),
      config({ batchSize: 2, maxExamples: 3 }),
      { onPage: (metric) => metrics.push(metric) },
    );

    expect(streamed).toHaveLength(3);
    expect(search.calls).toHaveLength(3);
    expect(events.indexOf("search")).toBeGreaterThan(events.lastIndexOf("sql"));
    expect(events.indexOf("search")).toBeGreaterThan(events.indexOf("transaction:end"));
    expect(metrics.map((metric) => metric.pageOutcomeRows)).toEqual([2, 2, 2, 2, 1]);
    expect(metrics.map((metric) => metric.selectedOutcomeRows)).toEqual([2, 3, 3, 3, 3]);
    expect(metrics.map((metric) => metric.bufferedOutcomeRows)).toEqual([4, 5, 5, 5, 4]);
    expect(Math.max(...metrics.map((metric) => metric.bufferedOutcomeRows))).toBe(5);
    expect(metrics.every((metric) => metric.bufferedOutcomeRows <= 2 + 3)).toBe(true);
  });

  test.each([
    [{ cohort: "" }, /cohort must be/],
    [{ seed: -1 }, /seed must be an unsigned 32-bit integer/],
    [{ seed: 0x1_0000_0000 }, /seed must be an unsigned 32-bit integer/],
    [{ batchSize: 0 }, /batchSize must be an integer/],
    [{ batchSize: 5_001 }, /batchSize must be an integer/],
    [{ batchSize: 1.5 }, /batchSize must be an integer/],
    [{ maxExamples: 0 }, /maxExamples must be a positive safe integer/],
    [{ maxExamples: Number.MAX_SAFE_INTEGER + 1 }, /maxExamples must be a positive safe integer/],
  ])("rejects invalid corpus config before querying: %p", async (override, error) => {
    const sql = makeSql([]);
    const search = makeSearcher();
    const source = new PrismaCorpusTrainingSource(sql.client, search.searcher);

    await expect(
      collect(source, new Date("2022-01-01T00:00:00.000Z"), config(override)),
    ).rejects.toThrow(error);
    expect(sql.calls).toHaveLength(0);
    expect(search.calls).toHaveLength(0);
  });

  test("rejects an invalid census date before querying", async () => {
    const sql = makeSql([]);
    const search = makeSearcher();
    const source = new PrismaCorpusTrainingSource(sql.client, search.searcher);

    await expect(collect(source, new Date(Number.NaN), config())).rejects.toThrow(
      /censusAt must be a valid date/,
    );
    expect(sql.calls).toHaveLength(0);
  });
});
