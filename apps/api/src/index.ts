import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "markus-api",
    env: process.env.NODE_ENV ?? "development",
    time: new Date().toISOString(),
  }),
);

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  // eslint-disable-next-line no-console
  console.log(`markus-api listening on :${port}`);
});
