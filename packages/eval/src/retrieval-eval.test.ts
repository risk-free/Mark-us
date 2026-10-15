import { loadKb, type KbEntry, type KbSearchHit } from "@markus/kb";

import { RETRIEVAL_CASES } from "./datasets.js";
import { runPiiEval } from "./pii-eval.js";
import { evaluateGate, formatEvalReport } from "./report.js";
import {
  precisionAtK,
  reciprocalRank,
  recallAtK,
  runRetrievalEval,
} from "./retrieval-eval.js";
import { EVAL_THRESHOLDS } from "./thresholds.js";

const hit = (topic: string, rank: number): KbSearchHit => ({
  entry: {
    id: `${topic}-${rank}`,
    topic,
    section: "basics",
    lang: "en",
    title: topic,
    url: "https://www.uspto.gov/trademarks/basics",
    text: topic,
  } satisfies KbEntry,
  score: 1 / (rank + 1),
});

describe("retrieval metrics", () => {
  const hits = [hit("a", 0), hit("b", 1), hit("c", 2), hit("d", 3)];

  test("recallAtK counts distinct expected topics found", () => {
    expect(recallAtK(hits, ["a", "c"], 3)).toBe(1);
    expect(recallAtK(hits, ["a", "d"], 3)).toBe(0.5);
    expect(recallAtK(hits, ["z"], 5)).toBe(0);
  });

  test("precisionAtK divides relevant top-k hits by k", () => {
    expect(precisionAtK(hits, ["a", "b"], 2)).toBe(1);
    expect(precisionAtK(hits, ["a", "z"], 2)).toBe(0.5);
    expect(precisionAtK(hits, [], 2)).toBe(0);
  });

  test("reciprocalRank scores the first relevant hit", () => {
    expect(reciprocalRank(hits, ["a"])).toBe(1);
    expect(reciprocalRank(hits, ["b"])).toBe(0.5);
    expect(reciprocalRank(hits, ["z"])).toBe(0);
  });
});

describe("runRetrievalEval", () => {
  test("meets the M5b retrieval floors and prints the report", async () => {
    const retrieval = runRetrievalEval(loadKb(), RETRIEVAL_CASES);
    const pii = await runPiiEval();

    console.log(formatEvalReport(retrieval, pii));

    expect(retrieval.recallAtK).toBeGreaterThanOrEqual(EVAL_THRESHOLDS.retrievalRecallAt5);
    expect(retrieval.mrr).toBeGreaterThanOrEqual(EVAL_THRESHOLDS.retrievalMrr);
    expect(retrieval.precisionAtK).toBeGreaterThanOrEqual(EVAL_THRESHOLDS.retrievalPrecisionAt3);
    expect(evaluateGate(retrieval, pii).pass).toBe(true);
  });
});
