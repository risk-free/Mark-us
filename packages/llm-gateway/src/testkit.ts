/**
 * Shared test scaffolding for the gateway suite. Not a test file (excluded from
 * the build) — stubs `fetch`, an injectable clock and an inert `sleep` so no
 * test touches the network or wall time (M13.6).
 */

import type { GatewayConfig } from "./config.js";
import type { LlmGatewayDeps } from "./types.js";

export interface FetchCall {
  url: string;
  body: unknown;
}

export type FetchHandler = (
  url: string,
  body: unknown,
  callIndex: number,
) => Response | Promise<Response>;

export interface FetchStub {
  fn: typeof fetch;
  calls: FetchCall[];
}

export function makeFetchStub(handler: FetchHandler): FetchStub {
  const calls: FetchCall[] = [];
  const fn = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = init?.body;
    const body: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    calls.push({ url, body });
    return handler(url, body, calls.length - 1);
  }) as typeof fetch;
  return { fn, calls };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface Clock {
  now: () => number;
  advance: (ms: number) => number;
}

export function makeClock(start = 0): Clock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
      return current;
    },
  };
}

export const TEST_CONFIG = (overrides: Partial<GatewayConfig> = {}): GatewayConfig => ({
  primary: { baseUrl: "https://primary.test/v1", apiKey: "primary-key", model: "primary-model" },
  fallback: {
    baseUrl: "https://fallback.test/v1",
    apiKey: "fallback-key",
    model: "fallback-model",
  },
  embedUrl: "https://embed.test/v1",
  ...overrides,
});

export const TEST_DEPS = (overrides: Partial<LlmGatewayDeps> = {}): LlmGatewayDeps => ({
  now: () => 0,
  random: () => 0.5,
  sleep: async () => undefined,
  ...overrides,
});

export const cleanMessages = [{ role: "user" as const, content: "ACME SOL, class 25, US" }];

export const chatOk = {
  choices: [{ message: { content: "ok" } }],
  usage: { prompt_tokens: 1000, completion_tokens: 500 },
};
