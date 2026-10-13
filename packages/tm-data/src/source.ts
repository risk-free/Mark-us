/**
 * `TrademarkSource` seam (D-02) + the two concrete adapters.
 *
 * The nightly corpus feed is the USPTO Open Data Portal TDXF XML product
 * (`trtdxfap`), which is **gated** since 2026-06-18 (firm USPTO.gov account + 4
 * ODP profile fields + API key) — recorded as FA-011. Until that is provisioned
 * the only reachable bulk path is the researcher product `TRCFECO2`, whose files
 * are served through an anonymous **temporary signed-URL** endpoint (ARCH-05 §1).
 *
 * Both adapters implement the same seam, so the ingest engine (`ingest.ts`) is
 * source-agnostic: swap in `OdpTdxfSource` the day FA-011 clears.
 */

import { gunzipSync } from "node:zlib";

import { unzipSync } from "fflate";

import { parseCsvText, rowsToRecords } from "./csv.js";
import { parseResearcherRecord } from "./researcher.js";
import type { ParseOutcome } from "./types.js";

export class SourceUnavailableError extends Error {
  readonly code: string;

  constructor(message: string, code = "SOURCE_UNAVAILABLE") {
    super(message);
    this.name = "SourceUnavailableError";
    this.code = code;
  }
}

export interface TrademarkSource {
  readonly name: string;
  /** Yield one outcome per source row; `runDate` selects the day's files. */
  fetchRecords(runDate: Date): AsyncIterable<ParseOutcome>;
}

/** Bytes → text for a compressed archive, keyed by file name (`.zip` / `.gz`). */
export type ArchiveDecoder = (bytes: Uint8Array, fileName: string) => string | Promise<string>;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const GZIP_MAGIC = [0x1f, 0x8b] as const;

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  magic.every((byte, index) => bytes[index] === byte);

/**
 * Default archive decoder. ZIP is read with `fflate` (the researcher files are
 * `.csv.zip`); gzip with `node:zlib`; anything else is treated as plain text.
 * The first CSV entry of a ZIP is used.
 */
export async function defaultArchiveDecoder(bytes: Uint8Array, fileName: string): Promise<string> {
  if (startsWith(bytes, ZIP_MAGIC)) {
    const entries = unzipSync(bytes);
    const csvName = Object.keys(entries).find((name) => name.toLowerCase().endsWith(".csv"));
    if (!csvName) throw new SourceUnavailableError(`no .csv entry in ${fileName}`);
    return new TextDecoder("utf-8").decode(entries[csvName]);
  }
  if (startsWith(bytes, GZIP_MAGIC)) {
    return gunzipSync(bytes).toString("utf-8");
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export interface ResearcherHttpClient {
  /** GET a URL that returns the signed-URL envelope, e.g. `{ "Location": "…" }`. */
  getJson(url: string): Promise<unknown>;
  getBytes(url: string): Promise<Uint8Array>;
}

export const defaultHttpClient: ResearcherHttpClient = {
  async getJson(url) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new SourceUnavailableError(`signed-URL endpoint responded ${response.status}`, "HTTP_ERROR");
    }
    return response.json();
  },
  async getBytes(url) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new SourceUnavailableError(`archive download responded ${response.status}`, "HTTP_ERROR");
    }
    return new Uint8Array(await response.arrayBuffer());
  },
};

export interface Trcfeco2SourceOptions {
  /** Portal base, e.g. `https://data.uspto.gov` (env `USPTO_BULK_BASE_URL`). */
  baseUrl: string;
  /** Product id, default `TRCFECO2` (env `USPTO_RESEARCHER_PRODUCT_ID`). */
  productId?: string;
  /** Which year files to backfill; defaults to `runDate`'s year. */
  years?: readonly number[];
  /** Table inside the product, default `case_file`. */
  table?: string;
  http?: ResearcherHttpClient;
  decode?: ArchiveDecoder;
}

const resolveLocation = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null || !("Location" in payload)) {
    throw new SourceUnavailableError("signed-URL envelope has no Location field", "BAD_ENVELOPE");
  }
  const location = (payload as { Location: unknown }).Location;
  if (typeof location !== "string" || location.length === 0) {
    throw new SourceUnavailableError("signed-URL envelope Location is empty", "BAD_ENVELOPE");
  }
  return location;
};

/** Backfill adapter: researcher case files via the anonymous signed-URL endpoint. */
export class Trcfeco2Source implements TrademarkSource {
  readonly name = "uspto-researcher-trcfeco2";
  readonly #options: Required<Pick<Trcfeco2SourceOptions, "baseUrl">> & Trcfeco2SourceOptions;

  constructor(options: Trcfeco2SourceOptions) {
    this.#options = options;
  }

  async *fetchRecords(runDate: Date): AsyncIterable<ParseOutcome> {
    const {
      baseUrl,
      productId = "TRCFECO2",
      years = [runDate.getUTCFullYear()],
      table = "case_file",
      http = defaultHttpClient,
      decode = defaultArchiveDecoder,
    } = this.#options;

    for (const year of years) {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/ui/datasets/products/files/${productId}/${year}/${table}.csv.zip`;
      const location = resolveLocation(await http.getJson(endpoint));
      const bytes = await http.getBytes(location);
      const text = await decode(bytes, `${table}.csv.zip`);

      const rows = parseCsvText(text);
      const headers = rows[0];
      if (!headers || headers.length === 0) {
        throw new SourceUnavailableError(`archive ${year}/${table} has no header row`, "EMPTY_ARCHIVE");
      }
      const sourceFile = `${productId}/${year}/${table}.csv`;
      for (const record of rowsToRecords(headers, rows.slice(1))) {
        yield parseResearcherRecord(record, sourceFile);
      }
    }
  }
}

/**
 * Nightly ODP TDXF adapter — stubbed until FA-011 provisions the firm's ODP
 * account (firm USPTO.gov account + 4 ODP profile fields + API key). Fails loud
 * rather than silently returning nothing, so a scheduled job surfaces the gap.
 */
export class OdpTdxfSource implements TrademarkSource {
  readonly name = "uspto-odp-tdxf";
  readonly #baseUrl: string;

  constructor(options: { baseUrl: string }) {
    this.#baseUrl = options.baseUrl;
  }

  // eslint-disable-next-line require-yield
  async *fetchRecords(): AsyncIterable<ParseOutcome> {
    throw new SourceUnavailableError(
      `USPTO ODP TDXF feed at ${this.#baseUrl} is gated (FA-011): firm USPTO.gov account + 4 ODP profile fields + API key. Use Trcfeco2Source for backfill until provisioned.`,
      "FA-011",
    );
  }
}
