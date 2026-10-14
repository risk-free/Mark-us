import { PrismaCorpusSearcher, SEARCH_DISCLAIMER, SEARCH_METHOD, SEARCH_MIN_SCORE, type CorpusSqlClient } from "./search.js";

const row = {
  serialNumber: "11111111",
  registrationNumber: "6789012",
  markText: "ACME Sol",
  statusCode: "700",
  filingDate: new Date("2021-03-04T00:00:00.000Z"),
  registrationDate: new Date("2022-06-07T00:00:00.000Z"),
  goodsSummary: "clothing, footwear",
  classCodes: [25],
  score: 0.612,
};

const makeSql = (onQuery: (values: unknown[]) => void = () => undefined): CorpusSqlClient => ({
  async $queryRaw<T>(_: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    onQuery(values);
    return [row] as T;
  },
});

describe("PrismaCorpusSearcher", () => {
  test("returns the M7.2 contract with an empty candidate set for a blank query", async () => {
    const sql = makeSql(() => {
      throw new Error("must not touch the database for an empty query");
    });
    const result = await new PrismaCorpusSearcher(sql).search("   ");
    expect(result).toEqual({
      query: "   ",
      method: SEARCH_METHOD,
      minScore: SEARCH_MIN_SCORE,
      isLegalAdvice: false,
      disclaimer: SEARCH_DISCLAIMER,
      candidates: [],
    });
  });

  test("normalises the query once at the boundary and clamps the limit", async () => {
    const calls: unknown[][] = [];
    const searcher = new PrismaCorpusSearcher(makeSql((values) => calls.push(values)));

    await searcher.search("  Café SOL  ");
    expect(calls[0]?.[0]).toBe("cafe sol");
    expect(calls[0]?.[2]).toBe(20);

    await searcher.search("x", { limit: 500 });
    expect(calls[1]?.[2]).toBe(100);
  });

  test("maps ranked rows into candidates", async () => {
    const result = await new PrismaCorpusSearcher(makeSql()).search("acme", { limit: 3 });
    expect(result.method).toBe("trigram");
    expect(result.isLegalAdvice).toBe(false);
    expect(result.candidates).toEqual([row]);
  });
});