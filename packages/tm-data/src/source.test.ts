import { gzipSync } from "node:zlib";

import { zipSync, strToU8 } from "fflate";

import {
  defaultArchiveDecoder,
  OdpTdxfSource,
  SourceUnavailableError,
  Trcfeco2Source,
  type ResearcherHttpClient,
} from "./source.js";
import type { ParseOutcome } from "./types.js";

const collect = async (source: { fetchRecords(runDate: Date): AsyncIterable<ParseOutcome> }, runDate: Date) => {
  const outcomes: ParseOutcome[] = [];
  for await (const outcome of source.fetchRecords(runDate)) outcomes.push(outcome);
  return outcomes;
};

const CSV = [
  "serial_no,mark_id_char,cfh_status_cd,cfh_status_dt,filing_dt,registration_dt,registration_no,abandon_dt,mark_draw_cd,std_char_claim_in,tad_file_id",
  "11111111,ACME,700,2024-01-02,2021-03-04,2022-06-07,6789012,,4000,Y,42",
  "22222222,BIG CO,600,2024-02-01,2023-01-01,,,,3000,,42",
].join("\n");

describe("OdpTdxfSource", () => {
  test("fails loud with the FA-011 code until ODP access is provisioned", async () => {
    const source = new OdpTdxfSource({ baseUrl: "https://data.uspto.gov" });
    await expect(collect(source, new Date("2026-10-13"))).rejects.toThrow(SourceUnavailableError);
    await expect(collect(source, new Date("2026-10-13"))).rejects.toMatchObject({ code: "FA-011" });
  });
});

describe("Trcfeco2Source", () => {
  test("resolves the signed URL then parses the decompressed CSV", async () => {
    const requested: string[] = [];
    const http: ResearcherHttpClient = {
      getJson: async (url) => {
        requested.push(url);
        return { Location: "https://cdn.example/signed/case_file.csv.zip" };
      },
      getBytes: async (url) => {
        requested.push(url);
        return new Uint8Array([1, 2, 3]);
      },
    };
    const source = new Trcfeco2Source({
      baseUrl: "https://data.uspto.gov/",
      years: [2024],
      http,
      decode: () => CSV,
    });

    const outcomes = await collect(source, new Date("2026-10-13"));
    expect(outcomes.map((o) => o.kind)).toEqual(["record", "record"]);
    expect(requested[0]).toBe(
      "https://data.uspto.gov/ui/datasets/products/files/TRCFECO2/2024/case_file.csv.zip",
    );
    expect(requested[1]).toBe("https://cdn.example/signed/case_file.csv.zip");
    if (outcomes[0]?.kind === "record") {
      expect(outcomes[0].record.serialNumber).toBe("11111111");
      expect(outcomes[0].record.sourceFile).toBe("TRCFECO2/2024/case_file.csv");
    }
  });

  test("rejects a malformed signed-URL envelope", async () => {
    const source = new Trcfeco2Source({
      baseUrl: "https://data.uspto.gov",
      years: [2024],
      http: { getJson: async () => ({}), getBytes: async () => new Uint8Array() },
      decode: () => CSV,
    });
    await expect(collect(source, new Date("2026-10-13"))).rejects.toMatchObject({ code: "BAD_ENVELOPE" });
  });
});

describe("defaultArchiveDecoder", () => {
  test("reads a zipped CSV (researcher .csv.zip shape)", async () => {
    const zip = zipSync({ "case_file.csv": strToU8("a,b\n1,2\n") });
    await expect(defaultArchiveDecoder(new Uint8Array(zip), "case_file.csv.zip")).resolves.toBe("a,b\n1,2\n");
  });

  test("reads a gzip archive", async () => {
    const gz = gzipSync(Buffer.from("a,b\n1,2\n"));
    await expect(defaultArchiveDecoder(new Uint8Array(gz), "case_file.csv.gz")).resolves.toBe("a,b\n1,2\n");
  });

  test("passes plain text through", async () => {
    await expect(defaultArchiveDecoder(strToU8("plain"), "x.txt")).resolves.toBe("plain");
  });

  test("errors when a zip carries no CSV entry", async () => {
    const zip = zipSync({ "readme.txt": strToU8("hi") });
    await expect(defaultArchiveDecoder(new Uint8Array(zip), "x.zip")).rejects.toThrow(/no \.csv entry/);
  });
});
