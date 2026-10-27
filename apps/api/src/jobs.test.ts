/**
 * P5.2 (M7.1) unit gate for `POST /admin/jobs`: job-spec validation, payload
 * passthrough to the enqueue seam, and worker isolation from API boot — the
 * app boots and serves without a queue configured, and the route degrades to
 * 503 instead of crashing.
 */

import type { CorpusStore } from "@markus/tm-data";

import { createApp, type AppServices } from "./app.js";
import { createInMemoryAuth } from "./auth/fakes.js";
import type { TmIngestJobSpec } from "./jobs.js";

const IP = "192.0.2.55";

const fakeCorpus: Pick<AppServices, "search" | "store" | "assess"> = {
  search: {
    async search() {
      throw new Error("not exercised by the jobs gate");
    },
  },
  store: {
    async lastCompletedRunAt() {
      return null;
    },
    async recentRuns() {
      return [];
    },
  } as unknown as CorpusStore,
  assess: {
    async score() {
      throw new Error("not exercised by the jobs gate");
    },
  },
};

interface JobsContext {
  app: ReturnType<typeof createApp>;
  enqueued: Array<{ name: string; payload: TmIngestJobSpec }>;
  cookie: string;
  csrf: string;
}

const build = async (
  options: { withQueue?: boolean; addError?: Error } = {},
): Promise<JobsContext> => {
  const auth = createInMemoryAuth();
  const enqueued: JobsContext["enqueued"] = [];
  const app = createApp(
    {
      ...fakeCorpus,
      auth: { sessions: auth.sessions, staffAuth: auth.staffAuth, magicLinks: auth.magicLinks },
    },
    {
      freshnessSlaHours: 26,
      secureCookies: true,
      ...(options.withQueue === false
        ? {}
        : {
            jobsQueue: {
              async add(name: string, payload: TmIngestJobSpec) {
                if (options.addError) throw options.addError;
                enqueued.push({ name, payload });
                return { id: "job-1" };
              },
            },
          }),
    },
  );
  const session = await auth.sessions.create({
    actorType: "STAFF",
    actorId: "admin-1",
    role: "MASTER_ADMIN",
    locale: "zh-CN",
    ip: IP,
    ua: "jest",
  });
  return {
    app,
    enqueued,
    cookie: `mkus_staff=${session.id}`,
    csrf: session.record.csrfSecret,
  };
};

const enqueue = (
  app: JobsContext["app"],
  ctx: Pick<JobsContext, "cookie" | "csrf">,
  body: unknown,
) =>
  app.request("/admin/jobs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": IP,
      cookie: ctx.cookie,
      "x-csrf-token": ctx.csrf,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /admin/jobs — job-spec validation", () => {
  test("rejects a missing or unsupported queue", async () => {
    const ctx = await build();

    expect((await enqueue(ctx.app, ctx, {})).status).toBe(400);
    expect((await enqueue(ctx.app, ctx, { queue: "ocr" })).status).toBe(400);
  });

  test("rejects a malformed runDate, years, table or source", async () => {
    const ctx = await build();

    expect((await enqueue(ctx.app, ctx, { queue: "tm-ingest", runDate: "not-a-date" })).status).toBe(400);
    expect((await enqueue(ctx.app, ctx, { queue: "tm-ingest", years: ["2026"] })).status).toBe(400);
    expect((await enqueue(ctx.app, ctx, { queue: "tm-ingest", years: [1800] })).status).toBe(400);
    expect((await enqueue(ctx.app, ctx, { queue: "tm-ingest", table: "  " })).status).toBe(400);
    expect((await enqueue(ctx.app, ctx, { queue: "tm-ingest", source: "tsdr" })).status).toBe(400);
  });

  test("rejects a non-JSON body", async () => {
    const ctx = await build();

    expect((await enqueue(ctx.app, ctx, "not-json{")).status).toBe(400);
  });

  test("accepts a full spec and passes it to the queue verbatim", async () => {
    const ctx = await build();

    const response = await enqueue(ctx.app, ctx, {
      queue: "tm-ingest",
      name: "backfill-2025",
      runDate: "2026-10-26",
      years: [2025, 2026],
      table: "case_file",
      source: "trcfeco2",
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: "job-1", status: "QUEUED", queue: "tm-ingest" });
    expect(ctx.enqueued).toEqual([
      {
        name: "backfill-2025",
        payload: {
          runDate: "2026-10-26",
          years: [2025, 2026],
          table: "case_file",
          source: "trcfeco2",
        },
      },
    ]);
  });

  test("defaults the job name to 'backfill' for the bare spec", async () => {
    const ctx = await build();

    const response = await enqueue(ctx.app, ctx, { queue: "tm-ingest" });

    expect(response.status).toBe(202);
    expect(ctx.enqueued[0]).toEqual({ name: "backfill", payload: {} });
  });
});

describe("POST /admin/jobs — worker isolation from API boot", () => {
  test("the app boots and serves health without a queue; the route 503s", async () => {
    const ctx = await build({ withQueue: false });

    expect((await ctx.app.request("/health")).status).toBe(200);
    const response = await enqueue(ctx.app, ctx, { queue: "tm-ingest" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "job queue unavailable" });
  });

  test("an enqueue rejection degrades to 503, never a crash", async () => {
    const ctx = await build({ addError: new Error("redis is down") });

    const response = await enqueue(ctx.app, ctx, { queue: "tm-ingest" });

    expect(response.status).toBe(503);
    expect((await ctx.app.request("/health")).status).toBe(200);
  });
});
