import {
  hybridSearchScore,
  PrismaCorpusSearcher,
  SEARCH_CANDIDATE_POOL_SIZE,
  SEARCH_DISCLAIMER,
  SEARCH_METHOD,
  SEARCH_MIN_SCORE,
  type CorpusSqlClient,
} from "./search.js";

interface FakeRow {
  serialNumber: string;
  registrationNumber: string | null;
  markText: string;
  normalizedText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  goodsSummary: string | null;
  classCodes: number[];
  trigramScore: number;
}

const row = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  serialNumber: "11111111",
  registrationNumber: "6789012",
  markText: "ACME Sol",
  normalizedText: "acme sol",
  statusCode: "700",
  filingDate: new Date("2021-03-04T00:00:00.000Z"),
  registrationDate: new Date("2022-06-07T00:00:00.000Z"),
  goodsSummary: "clothing, footwear",
  classCodes: [25],
  trigramScore: 0.612,
  ...overrides,
});

const makeSql = (
  rows: FakeRow[] = [row()],
  onQuery: (values: unknown[]) => void = () => undefined,
): CorpusSqlClient => ({
  async $queryRaw<T>(_: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    onQuery(values);
    return rows as T;
  },
});

describe("hybridSearchScore (P5.3 fusion math)", () => {
  test("applies the 0.65 / 0.25 / 0.10 weights with a query class", () => {
    expect(
      hybridSearchScore({ trigram: 0.8, phonetic: 0.4, classAdjacency: 0.5 }),
    ).toBeCloseTo(0.67, 12);
  });

  test("renormalises to 0.72 / 0.28 without a query class", () => {
    expect(hybridSearchScore({ trigram: 0.8, phonetic: 0.4 })).toBeCloseTo(0.688, 12);
  });

  test("clamps the composite to 0..1", () => {
    expect(hybridSearchScore({ trigram: 2, phonetic: 2, classAdjacency: 2 })).toBe(1);
    expect(hybridSearchScore({ trigram: -1, phonetic: -1, classAdjacency: -1 })).toBe(0);
  });
});

describe("PrismaCorpusSearcher", () => {
  test("returns the contract with an empty candidate set for a blank query", async () => {
    const sql = makeSql([], () => {
      throw new Error("must not touch the database for an empty query");
    });
    const result = await new PrismaCorpusSearcher(sql).search("   ", { minScore: 0.7 });
    expect(result).toEqual({
      query: "   ",
      method: SEARCH_METHOD,
      minScore: 0.7,
      isLegalAdvice: false,
      disclaimer: SEARCH_DISCLAIMER,
      candidates: [],
    });
  });

  test("normalises the query once at the boundary and bounds the SQL rerank pool", async () => {
    const calls: unknown[][] = [];
    const searcher = new PrismaCorpusSearcher(makeSql([], (values) => calls.push(values)));

    await searcher.search("  Café SOL  ");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("cafe sol");
    expect(calls[0]?.[1]).toBe("cafe sol");
    expect(calls[0]?.at(-1)).toBe(SEARCH_CANDIDATE_POOL_SIZE);
  });

  test("applies training self/future predicates in SQL before the pool limit", async () => {
    let statement = "";
    let values: unknown[] = [];
    const sql: CorpusSqlClient = {
      async $queryRaw<T>(strings: TemplateStringsArray, ...parameters: unknown[]): Promise<T> {
        statement = strings.join("?");
        values = parameters;
        return [] as T;
      },
    };
    const filedBefore = new Date("2020-01-01T00:00:00.000Z");

    await new PrismaCorpusSearcher(sql).search("acme", {
      excludeSerialNumber: "query-serial",
      filedBefore,
    });

    expect(statement).toContain('m."serialNumber" <>');
    expect(statement).toContain('m."filingDate" <');
    expect(statement.indexOf('m."serialNumber" <>')).toBeLessThan(statement.lastIndexOf("ORDER BY"));
    expect(statement.indexOf('m."filingDate" <')).toBeLessThan(statement.indexOf("LIMIT"));
    expect(values).toEqual(expect.arrayContaining(["query-serial", filedBefore]));
  });

  test("clamps the response limit after composite ranking", async () => {
    const rows = Array.from({ length: 105 }, (_, index) =>
      row({
        serialNumber: String(index).padStart(8, "0"),
        markText: "Cafe Sol",
        normalizedText: "cafe sol",
        trigramScore: 1,
      }),
    );

    const result = await new PrismaCorpusSearcher(makeSql(rows)).search("cafe sol", { limit: 500 });

    expect(result.candidates).toHaveLength(100);
  });

  test("reports hybrid and maps only public candidate fields", async () => {
    const result = await new PrismaCorpusSearcher(makeSql()).search("acme sol", { limit: 3 });

    expect(result.method).toBe("hybrid");
    expect(result.isLegalAdvice).toBe(false);
    expect(result.minScore).toBe(SEARCH_MIN_SCORE);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).not.toHaveProperty("normalizedText");
    expect(result.candidates[0]).not.toHaveProperty("trigramScore");
    expect(result.candidates[0]?.serialNumber).toBe("11111111");
  });

  test("a phonetic variant outranks a higher-trigram near-miss", async () => {
    const phoneticVariant = row({
      serialNumber: "11111111",
      markText: "AKME",
      normalizedText: "akme",
      trigramScore: 0.4,
    });
    const trigramNearMiss = row({
      serialNumber: "22222222",
      markText: "ACZE",
      normalizedText: "acze",
      trigramScore: 0.7,
    });

    const result = await new PrismaCorpusSearcher(
      makeSql([trigramNearMiss, phoneticVariant]),
    ).search("acme");

    expect(result.candidates.map((candidate) => candidate.markText)).toEqual(["AKME", "ACZE"]);
    expect(result.candidates[0]?.score).toBeCloseTo(0.568, 12);
    expect(result.candidates[1]?.score).toBeCloseTo(0.504, 12);
  });

  test("a class-adjacent mark outranks a class-distant mark at equal text similarity", async () => {
    const distant = row({ serialNumber: "22222222", classCodes: [25], trigramScore: 1 });
    const related = row({ serialNumber: "11111111", classCodes: [42], trigramScore: 1 });

    const result = await new PrismaCorpusSearcher(makeSql([distant, related])).search("acme sol", {
      niceClass: 9,
    });

    expect(result.candidates.map((candidate) => candidate.classCodes)).toEqual([[42], [25]]);
    expect(result.candidates[0]?.score).toBeCloseTo(0.95, 12);
    expect(result.candidates[1]?.score).toBeCloseTo(0.9, 12);
  });

  test("minScore filters the composite, not the trigram feature", async () => {
    const identicalTextDistantClass = row({ serialNumber: "22222222", classCodes: [25], trigramScore: 1 });
    const identicalTextRelatedClass = row({ serialNumber: "11111111", classCodes: [42], trigramScore: 1 });

    const result = await new PrismaCorpusSearcher(
      makeSql([identicalTextDistantClass, identicalTextRelatedClass]),
    ).search("acme sol", { niceClass: 9, minScore: 0.95 });

    expect(result.minScore).toBe(0.95);
    expect(result.candidates.map((candidate) => candidate.classCodes)).toEqual([[42]]);
  });

  test("breaks composite-score ties deterministically by serial number", async () => {
    const later = row({ serialNumber: "22222222", trigramScore: 1 });
    const earlier = row({ serialNumber: "11111111", trigramScore: 1 });

    const result = await new PrismaCorpusSearcher(makeSql([later, earlier])).search("acme sol");

    expect(result.candidates.map((candidate) => candidate.serialNumber)).toEqual([
      "11111111",
      "22222222",
    ]);
  });
});
