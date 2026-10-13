/**
 * Corpus persistence seam (mandate M7.1) + the Prisma-backed store.
 *
 * `CorpusStore` is the only surface the ingest engine touches, so the engine is
 * unit-testable with an in-memory double (ARCH-01 §13 allows fakes for unit
 * tests; the real store is covered against PostgreSQL). Like `@markus/outbox`,
 * this package does **not** depend on the generated Prisma client — the store
 * describes the tiny structural surface it needs and the client is injected at
 * wiring time (cast at the boundary, since Prisma's JSON input types are nominal).
 */

import type { CorpusMarkInput } from "./types.js";

export type UpsertAction = "imported" | "updated" | "skipped";

export interface RunCounters {
  filesProcessed: number;
  marksUpserted: number;
  marksSkipped: number;
  marksImported: number;
  marksUpdated: number;
  marksRejected: number;
}

export interface RejectEntry {
  reason: string;
  raw: string;
}

export interface FinishRunInput extends RunCounters {
  errorLog: RejectEntry[] | null;
  finishedAt: Date;
}

export interface CorpusStore {
  /** Find-or-create the run for `runDate` (unique) and mark it `running`. */
  startRun(runDate: Date): Promise<string>;
  upsertMark(input: CorpusMarkInput, ingestRunId: string): Promise<UpsertAction>;
  finishRun(ingestRunId: string, input: FinishRunInput): Promise<void>;
  failRun(ingestRunId: string, errorLog: unknown): Promise<void>;
  /** `finishedAt` of the newest `complete` run, for freshness (null if none). */
  lastCompletedRunAt(): Promise<Date | null>;
}

interface MarkScalars {
  registrationNumber: string | null;
  markText: string;
  normalizedText: string;
  statusCode: string;
  filingDate: Date | null;
  registrationDate: Date | null;
  abandonDate: Date | null;
  goodsSummary: string | null;
  sourceFile: string;
  sourceUpdatedAt: Date | null;
  ingestRunId: string;
}

export interface CorpusRawClient {
  tmCorpusMark: {
    findUnique(args: {
      where: { serialNumber: string };
      select: { id: true; sourceUpdatedAt: true };
    }): Promise<{ id: string; sourceUpdatedAt: Date | null } | null>;
    create(args: { data: MarkScalars & { serialNumber: string } }): Promise<unknown>;
    update(args: { where: { id: string }; data: MarkScalars }): Promise<unknown>;
  };
  tmIngestRun: {
    upsert(args: {
      where: { runDate: Date };
      create: { runDate: Date; status: string };
      update: { status: string };
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: Partial<RunCounters> & { status: string; errorLog?: unknown; finishedAt?: Date };
    }): Promise<unknown>;
    findFirst(args: {
      where: { status: string };
      orderBy: { finishedAt: "desc" };
      select: { finishedAt: true };
    }): Promise<{ finishedAt: Date | null } | null>;
  };
}

export interface CorpusTransactionHost {
  $transaction<T>(work: (tx: CorpusRawClient) => Promise<T>): Promise<T>;
}

const markScalars = (input: CorpusMarkInput, ingestRunId: string): MarkScalars => ({
  registrationNumber: input.registrationNumber,
  markText: input.markText,
  normalizedText: input.normalizedText,
  statusCode: input.statusCode,
  filingDate: input.filingDate,
  registrationDate: input.registrationDate,
  abandonDate: input.abandonDate,
  goodsSummary: input.goodsSummary,
  sourceFile: input.sourceFile,
  sourceUpdatedAt: input.sourceUpdatedAt,
  ingestRunId,
});

export class PrismaCorpusStore implements CorpusStore {
  readonly #host: CorpusTransactionHost;

  constructor(host: CorpusTransactionHost) {
    this.#host = host;
  }

  async startRun(runDate: Date): Promise<string> {
    const run = await this.#host.$transaction((tx) =>
      tx.tmIngestRun.upsert({
        where: { runDate },
        create: { runDate, status: "running" },
        update: { status: "running" },
      }),
    );
    return run.id;
  }

  upsertMark(input: CorpusMarkInput, ingestRunId: string): Promise<UpsertAction> {
    return this.#host.$transaction(async (tx) => {
      const existing = await tx.tmCorpusMark.findUnique({
        where: { serialNumber: input.serialNumber },
        select: { id: true, sourceUpdatedAt: true },
      });

      if (!existing) {
        await tx.tmCorpusMark.create({
          data: { serialNumber: input.serialNumber, ...markScalars(input, ingestRunId) },
        });
        return "imported";
      }

      const incoming = input.sourceUpdatedAt;
      const stored = existing.sourceUpdatedAt;
      if (incoming !== null && stored !== null && incoming.getTime() <= stored.getTime()) {
        return "skipped";
      }

      await tx.tmCorpusMark.update({
        where: { id: existing.id },
        data: markScalars(input, ingestRunId),
      });
      return "updated";
    });
  }

  async finishRun(ingestRunId: string, input: FinishRunInput): Promise<void> {
    await this.#host.$transaction((tx) =>
      tx.tmIngestRun.update({
        where: { id: ingestRunId },
        data: {
          status: "complete",
          filesProcessed: input.filesProcessed,
          marksUpserted: input.marksUpserted,
          marksSkipped: input.marksSkipped,
          marksImported: input.marksImported,
          marksUpdated: input.marksUpdated,
          marksRejected: input.marksRejected,
          errorLog: input.errorLog ?? undefined,
          finishedAt: input.finishedAt,
        },
      }),
    );
  }

  async failRun(ingestRunId: string, errorLog: unknown): Promise<void> {
    await this.#host.$transaction((tx) =>
      tx.tmIngestRun.update({
        where: { id: ingestRunId },
        data: { status: "failed", errorLog, finishedAt: new Date() },
      }),
    );
  }

  async lastCompletedRunAt(): Promise<Date | null> {
    const run = await this.#host.$transaction((tx) =>
      tx.tmIngestRun.findFirst({
        where: { status: "complete" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
    );
    return run?.finishedAt ?? null;
  }
}
