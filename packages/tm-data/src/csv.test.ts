import { parseCsvText, rowsToRecords } from "./csv.js";

describe("parseCsvText", () => {
  test("reads a simple grid and tolerates trailing newline", () => {
    expect(parseCsvText("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("respects quotes around commas and newlines", () => {
    const text = 'serial,mark\n1,"ACME, INC\nINTERNATIONAL"\n2,plain\n';
    expect(parseCsvText(text)).toEqual([
      ["serial", "mark"],
      ["1", "ACME, INC\nINTERNATIONAL"],
      ["2", "plain"],
    ]);
  });

  test("handles escaped quotes", () => {
    expect(parseCsvText('1,"say ""hi"""\n')).toEqual([["1", 'say "hi"']]);
  });

  test("keeps empty trailing fields", () => {
    expect(parseCsvText("a,\n")).toEqual([["a", ""]]);
  });

  test("tolerates CRLF", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("rowsToRecords", () => {
  test("zips headers with rows and defaults missing cells to empty", () => {
    const records = rowsToRecords(["a", "b"], [["1", "2"], ["3"]]);
    expect(records).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "" },
    ]);
  });
});
