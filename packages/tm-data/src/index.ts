/**
 * USPTO trademark data (D-02):
 *  - NO TESS scraping (retired; tmsearch.uspto.gov has no official search API)
 *  - Daily USPTO bulk XML (LIVE only: 600s pending + 700s registered) → local Postgres index
 *  - TSDR API for per-mark status (daily T+1 batch, not webhook)
 *  - Upgrade paths documented, not built: A2 OpenSearch (TM5 word marks), A3 BGE embeddings
 *  - Word marks first; logo/design scoring deferred
 * Implementation lands in P5 (bulk ingest wave).
 */

export interface TsdrStatus {
  serialNumber: string;
  status: string;
  filingDate?: string;
  registrationNumber?: string;
  raw: unknown;
}

export async function fetchTsdr(serialNumber: string): Promise<TsdrStatus> {
  void serialNumber;
  throw new Error("@markus/tm-data: fetchTsdr not implemented (scaffold P0; lands in P5)");
}

export interface IngestReport {
  filesProcessed: number;
  marksUpserted: number;
  marksSkipped: number;
  startedAt: Date;
  finishedAt: Date;
}

export async function runDailyIngest(runDate: Date): Promise<IngestReport> {
  void runDate;
  throw new Error("@markus/tm-data: runDailyIngest not implemented (scaffold P0; lands in P5)");
}
