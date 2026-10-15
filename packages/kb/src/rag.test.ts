import {
  LlmGateway,
  LlmPiiError,
  LlmUnavailableError,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
} from "@markus/llm-gateway";

import { RagPipeline, RAG_MAX_TOP_K, RAG_MIN_TOP_K, type ChatClient } from "./rag.js";

interface Stub {
  client: ChatClient;
  calls: { messages: ChatMessage[]; options?: ChatOptions & { context?: Record<string, unknown> } }[];
}

const stubGateway = (
  impl: (messages: ChatMessage[]) => Promise<ChatResult> | ChatResult,
): Stub => {
  const calls: Stub["calls"] = [];
  const client: ChatClient = {
    chat: (messages, options) => {
      calls.push(options === undefined ? { messages } : { messages, options });
      return Promise.resolve(impl(messages));
    },
  };
  return { client, calls };
};

const okResult = (content: string): ChatResult => ({
  content,
  usage: { model: "test-model", promptTokens: 10, completionTokens: 5, costUsd: 0 },
  provider: "primary",
});

const cleanInput = {
  markText: "ACME",
  classCodes: [25, 35],
  jurisdiction: "US",
  businessDescription: "athletic apparel and retail store services",
  locale: "en",
};

describe("RagPipeline.retrieve", () => {
  test("returns between the top-k bounds for a rich query", () => {
    const pipeline = new RagPipeline(stubGateway(() => okResult("x")).client);
    const hits = pipeline.retrieve(cleanInput, RAG_MAX_TOP_K);
    expect(hits.length).toBeGreaterThanOrEqual(RAG_MIN_TOP_K);
    expect(hits.length).toBeLessThanOrEqual(RAG_MAX_TOP_K);
  });

  test("clamps a top-k outside the 3..5 band", () => {
    const pipeline = new RagPipeline(stubGateway(() => okResult("x")).client);
    expect(pipeline.retrieve(cleanInput, 1).length).toBeLessThanOrEqual(RAG_MIN_TOP_K);
    expect(pipeline.retrieve(cleanInput, 99).length).toBeLessThanOrEqual(RAG_MAX_TOP_K);
  });
});

describe("RagPipeline.answer (success)", () => {
  test("returns the model answer with numbered, sourced citations", async () => {
    const { client } = stubGateway(() => okResult("Filing guidance [1]."));
    const pipeline = new RagPipeline(client);

    const result = await pipeline.answer(cleanInput);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.answer).toBe("Filing guidance [1].");
    expect(result.provider).toBe("primary");
    expect(result.model).toBe("test-model");
    expect(result.citations.length).toBeGreaterThanOrEqual(RAG_MIN_TOP_K);
    result.citations.forEach((citation, index) => {
      expect(citation.index).toBe(index + 1);
      expect(citation.url).toMatch(/^https:\/\//);
      expect(citation.id).not.toBe("");
      expect(citation.title).not.toBe("");
    });
  });

  test("sends a system + user prompt that cites the retrieved entries by number", async () => {
    const { client, calls } = stubGateway(() => okResult("ok"));
    const pipeline = new RagPipeline(client);

    await pipeline.answer(cleanInput);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.messages).toHaveLength(2);
    expect(call?.messages[0]?.role).toBe("system");
    expect(call?.messages[0]?.content).toMatch(/not legal advice/i);
    const user = call?.messages[1]?.content ?? "";
    expect(user).toContain("[1]");
    expect(user).toContain(cleanInput.markText);
    expect(call?.options?.task).toBe("chatbot");
  });

  test("passes the requested task and token budget through to the gateway", async () => {
    const { client, calls } = stubGateway(() => okResult("ok"));
    const pipeline = new RagPipeline(client);

    await pipeline.answer(cleanInput, { task: "chatbot", temperature: 0, maxTokens: 256 });

    expect(calls[0]?.options).toMatchObject({ task: "chatbot", temperature: 0, maxTokens: 256 });
  });
});

describe("RagPipeline.answer (degradation, M6.4)", () => {
  test("returns a degraded result with citations and no answer on LlmUnavailableError", async () => {
    const { client } = stubGateway(() => {
      throw new LlmUnavailableError("all providers down");
    });
    const pipeline = new RagPipeline(client);

    const result = await pipeline.answer(cleanInput);

    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") throw new Error("expected degraded");
    expect(result.code).toBe("llm_unavailable");
    expect(result.reason).toContain("down");
    expect(result.citations.length).toBeGreaterThanOrEqual(RAG_MIN_TOP_K);
    expect(Object.prototype.hasOwnProperty.call(result, "answer")).toBe(false);
  });

  test("rethrows errors that are not an LLM outage", async () => {
    const { client } = stubGateway(() => {
      throw new Error("bug");
    });
    const pipeline = new RagPipeline(client);

    await expect(pipeline.answer(cleanInput)).rejects.toThrow("bug");
  });
});

describe("RagPipeline PII guard (M6.3)", () => {
  test("the gateway rejects a PII-bearing business description before any network call", async () => {
    const fetchMock = jest.fn(() => {
      throw new Error("network must not be reached");
    });
    const gateway = new LlmGateway(
      { primary: { baseUrl: "https://llm.test/v1", apiKey: "k", model: "m" } },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    const pipeline = new RagPipeline(gateway);

    await expect(
      pipeline.answer({ markText: "ACME", businessDescription: "reach me at jane.doe@example.com" }),
    ).rejects.toBeInstanceOf(LlmPiiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a clean input passes the real gateway guard and reaches the provider", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "answer [1]" } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const gateway = new LlmGateway(
      { primary: { baseUrl: "https://llm.test/v1", apiKey: "k", model: "m" } },
      { fetch: fetchMock as unknown as typeof fetch, sleep: async () => undefined },
    );
    const pipeline = new RagPipeline(gateway);

    const result = await pipeline.answer(cleanInput);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.answer).toBe("answer [1]");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
