import { loadKb } from "@markus/kb";

import { RETRIEVAL_CASES } from "./datasets.js";
import { runPiiEval } from "./pii-eval.js";
import { formatEvalReport } from "./report.js";
import { runRetrievalEval } from "./retrieval-eval.js";

describe("formatEvalReport", () => {
  test("snapshots the real M5b run", async () => {
    const retrieval = runRetrievalEval(loadKb(), RETRIEVAL_CASES);
    const pii = await runPiiEval();
    expect(formatEvalReport(retrieval, pii)).toMatchSnapshot();
  });
});
