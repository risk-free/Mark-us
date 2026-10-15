/**
 * PII guard eval (P6.4, gate M5b).
 *
 * Drives the real gateway against every PII vector with an injected fetch stub
 * and asserts the guard rejects before any provider call. A clean control proves
 * the guard is not blanket-rejecting everything. Fully deterministic: no clock,
 * no randomness, no real network (M13.6).
 */

import {
  assertNoPii,
  LlmGateway,
  LlmPiiError,
  type GatewayConfig,
} from "@markus/llm-gateway";
import { buildRagMessages, type PromptContext } from "@markus/kb";

import { CLEAN_CONTEXT, EVAL_SOURCES, PII_CASES, type PiiCase } from "./datasets.js";

/** Deterministic gateway config: one provider, no retries, no fallback. */
export const TEST_GATEWAY_CONFIG: GatewayConfig = {
  primary: { baseUrl: "https://example.invalid/v1", apiKey: "test", model: "deepseek-chat" },
  maxRetries: 0,
};

interface FetchCounter {
  count: number;
}

/**
 * OpenAI-compatible fetch stub that counts calls. Node 22+ ships a global
 * `Response`, so no testkit dependency is needed.
 */
export const countingFetch = (calls: FetchCounter): typeof fetch =>
  (async () => {
    calls.count += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

const createGateway = (calls: FetchCounter): LlmGateway =>
  new LlmGateway(TEST_GATEWAY_CONFIG, {
    fetch: countingFetch(calls),
    now: () => 0,
    random: () => 0,
    sleep: async () => {},
  });

const promptContextFor = (testCase: PiiCase): PromptContext => ({
  markText: testCase.markText,
  businessDescription: testCase.businessDescription,
  jurisdiction: testCase.jurisdiction,
  sources: EVAL_SOURCES,
  locale: "en",
});

const businessContextFor = (testCase: PiiCase): Record<string, unknown> => {
  const context: Record<string, unknown> = {};
  if (testCase.jurisdiction !== undefined) context.jurisdiction = testCase.jurisdiction;
  if (testCase.contextKey !== undefined) context[testCase.contextKey] = "sample";
  return context;
};

export interface PiiEvalReport {
  total: number;
  rejected: number;
  leaked: string[];
  fetchCallsOnRejected: number;
  positiveControlOk: boolean;
}

const isLlmPiiError = (error: unknown): boolean => error instanceof LlmPiiError;

async function positiveControl(): Promise<boolean> {
  const calls: FetchCounter = { count: 0 };
  const gateway = createGateway(calls);
  try {
    const result = await gateway.chat(buildRagMessages(CLEAN_CONTEXT), {
      context: {},
      task: "chatbot",
    });
    return calls.count === 1 && result.content === "hello";
  } catch {
    return false;
  }
}

/**
 * Reject every PII vector through both the bare guard and a real `chat` call,
 * counting any fetch that slips through, then verify the clean control resolves.
 */
export async function runPiiEval(): Promise<PiiEvalReport> {
  const calls: FetchCounter = { count: 0 };
  const gateway = createGateway(calls);
  const leaked: string[] = [];
  let rejected = 0;

  for (const testCase of PII_CASES) {
    const messages = buildRagMessages(promptContextFor(testCase));
    const context = businessContextFor(testCase);

    let guardRejected = false;
    try {
      assertNoPii(messages, context);
    } catch (error) {
      guardRejected = isLlmPiiError(error);
    }

    let chatRejected = false;
    try {
      await gateway.chat(messages, { context, task: "chatbot" });
    } catch (error) {
      chatRejected = isLlmPiiError(error);
    }

    if (guardRejected && chatRejected) {
      rejected += 1;
    } else {
      leaked.push(testCase.id);
    }
  }

  return {
    total: PII_CASES.length,
    rejected,
    leaked,
    fetchCallsOnRejected: calls.count,
    positiveControlOk: await positiveControl(),
  };
}
