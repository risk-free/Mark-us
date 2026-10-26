import { reduceUpload, type UploadState } from "./upload-machine";

/**
 * P2.6 gate: upload state machine — slot request → PUT bytes → complete, with
 * a failure edge at every stage and retry-from-terminal behaviour.
 */

const walk = (events: Parameters<typeof reduceUpload>[1][]): UploadState =>
  events.reduce(reduceUpload, { status: "idle" } as UploadState);

describe("reduceUpload", () => {
  test("happy path: idle → requesting → uploading → completing → done", () => {
    const state = walk([
      { type: "SUBMIT" },
      { type: "SLOT_READY" },
      { type: "BYTES_SENT" },
      { type: "COMPLETED", documentId: "doc_1" },
    ]);
    expect(state).toEqual({ status: "done", documentId: "doc_1" });
  });

  test("failure at each stage records that stage", () => {
    expect(walk([{ type: "SUBMIT" }, { type: "FAIL" }])).toEqual({
      status: "failed",
      stage: "requesting",
    });
    expect(
      walk([{ type: "SUBMIT" }, { type: "SLOT_READY" }, { type: "FAIL" }]),
    ).toEqual({ status: "failed", stage: "uploading" });
    expect(
      walk([
        { type: "SUBMIT" },
        { type: "SLOT_READY" },
        { type: "BYTES_SENT" },
        { type: "FAIL" },
      ]),
    ).toEqual({ status: "failed", stage: "completing" });
  });

  test("a fresh SUBMIT from a terminal state restarts the flow", () => {
    const failed = walk([{ type: "SUBMIT" }, { type: "FAIL" }]);
    expect(reduceUpload(failed, { type: "SUBMIT" })).toEqual({ status: "requesting" });

    const done = walk([
      { type: "SUBMIT" },
      { type: "SLOT_READY" },
      { type: "BYTES_SENT" },
      { type: "COMPLETED", documentId: "doc_1" },
    ]);
    expect(reduceUpload(done, { type: "SUBMIT" })).toEqual({ status: "requesting" });
  });

  test("out-of-order events are ignored rather than corrupting state", () => {
    expect(reduceUpload({ status: "idle" }, { type: "SLOT_READY" })).toEqual({
      status: "idle",
    });
    expect(
      reduceUpload({ status: "requesting" }, { type: "COMPLETED", documentId: "doc_1" }),
    ).toEqual({ status: "requesting" });
    expect(reduceUpload({ status: "uploading" }, { type: "SLOT_READY" })).toEqual({
      status: "uploading",
    });
  });
});
