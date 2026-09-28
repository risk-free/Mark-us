import { loadEnv } from "@markus/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config");
}

const env = loadEnv();

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "markus-api",
    env: env.NODE_ENV,
    time: new Date().toISOString(),
  }),
);

serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`markus-api listening on :${env.PORT}`);
});
