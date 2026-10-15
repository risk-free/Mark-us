import { runPiiEval } from "./pii-eval.js";

describe("runPiiEval (gate M5b)", () => {
  test("rejects every vector with zero fetches and a clean control", async () => {
    const report = await runPiiEval();
    expect(report.rejected).toBe(report.total);
    expect(report.leaked).toEqual([]);
    expect(report.fetchCallsOnRejected).toBe(0);
    expect(report.positiveControlOk).toBe(true);
  });

  test("covers multiple vector kinds", async () => {
    const report = await runPiiEval();
    expect(report.total).toBeGreaterThanOrEqual(6);
  });
});
