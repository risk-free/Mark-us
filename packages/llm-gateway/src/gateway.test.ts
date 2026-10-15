import { computeCostUsd } from "./config.js";
import { buildChatRequestBody, LlmGateway } from "./gateway.js";
import { LlmPiiError, LlmUnavailableError, type LlmCallRecord } from "./types.js";
import {
  chatOk,
  cleanMessages,
  jsonResponse,
  makeClock,
  makeFetchStub,
  TEST_CONFIG,
  TEST_DEPS,
} from "./testkit.js";

describe("LlmGateway.chat", () => {
  test("returns content, usage and an exact cost from the primary provider", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    const result = await gateway.chat(cleanMessages, { task: "chatbot" });

    expect(result.provider).toBe("primary");
    expect(result.content).toBe("ok");
    expect(result.usage).toEqual({
      model: "primary-model",
      promptTokens: 1000,
      completionTokens: 500,
      costUsd: computeCostUsd("primary-model", 1000, 500),
    });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.url).toBe("https://primary.test/v1/chat/completions");
  });

  test("resolves the model from the task map; a config change swaps it with no call-site change", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const config = TEST_CONFIG({ models: { lead_qualification: "task-model-a" } });
    const gateway = new LlmGateway(config, TEST_DEPS({ fetch: stub.fn }));

    await gateway.chat(cleanMessages, { task: "lead_qualification" });
    await gateway.chat(cleanMessages, { task: "chatbot" });
    config.models = { lead_qualification: "task-model-b" };
    await gateway.chat(cleanMessages, { task: "lead_qualification" });

    const models = stub.calls.map((call) => (call.body as { model: string }).model);
    expect(models).toEqual(["task-model-a", "primary-model", "task-model-b"]);
  });

  test("explicit opts.model wins over the task map", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(
      TEST_CONFIG({ models: { chatbot: "task-model" } }),
      TEST_DEPS({ fetch: stub.fn }),
    );

    await gateway.chat(cleanMessages, { task: "chatbot", model: "explicit-model" });

    expect((stub.calls[0]?.body as { model: string }).model).toBe("explicit-model");
  });

  test("retries a 500 with backoff then succeeds", async () => {
    let attempts = 0;
    const stub = makeFetchStub(() => {
      attempts += 1;
      return attempts < 3 ? jsonResponse({ error: "boom" }, 500) : jsonResponse(chatOk);
    });
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    const result = await gateway.chat(cleanMessages);

    expect(result.content).toBe("ok");
    expect(stub.calls).toHaveLength(3);
  });

  test("does not retry a non-429 4xx and fails over to the fallback", async () => {
    const stub = makeFetchStub((url) =>
      url.includes("primary") ? jsonResponse({ error: "bad request" }, 400) : jsonResponse(chatOk),
    );
    const gateway = new LlmGateway(TEST_CONFIG({ maxRetries: 2 }), TEST_DEPS({ fetch: stub.fn }));

    const result = await gateway.chat(cleanMessages);

    expect(result.provider).toBe("fallback");
    expect(stub.calls.map((call) => call.url)).toEqual([
      "https://primary.test/v1/chat/completions",
      "https://fallback.test/v1/chat/completions",
    ]);
  });

  test("falls back when the primary exhausts its retries", async () => {
    const stub = makeFetchStub((url) =>
      url.includes("primary") ? jsonResponse({ error: "boom" }, 503) : jsonResponse(chatOk),
    );
    const gateway = new LlmGateway(TEST_CONFIG({ maxRetries: 0 }), TEST_DEPS({ fetch: stub.fn }));

    const result = await gateway.chat(cleanMessages, { task: "chatbot" });

    expect(result.provider).toBe("fallback");
    expect(result.usage.model).toBe("fallback-model");
    expect(stub.calls).toHaveLength(2);
  });

  test("throws LlmUnavailableError when every provider fails (never a fabricated result)", async () => {
    const stub = makeFetchStub(() => jsonResponse({ error: "boom" }, 500));
    const gateway = new LlmGateway(TEST_CONFIG({ maxRetries: 0 }), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  test("throws LlmUnavailableError when every provider fails with a network error", async () => {
    const stub = makeFetchStub(() => {
      throw new Error("ECONNREFUSED");
    });
    const gateway = new LlmGateway(TEST_CONFIG({ maxRetries: 0 }), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(stub.calls).toHaveLength(2);
  });
});

describe("LlmGateway circuit breaker", () => {
  test("opens after the threshold, short-circuits, then half-opens after cooldown", async () => {
    const clock = makeClock();
    let healthy = false;
    const stub = makeFetchStub(() =>
      healthy ? jsonResponse(chatOk) : jsonResponse({ error: "boom" }, 500),
    );
    const gateway = new LlmGateway(
      TEST_CONFIG({ fallback: undefined, maxRetries: 0, circuit: { failureThreshold: 2, cooldownMs: 1000 } }),
      TEST_DEPS({ fetch: stub.fn, now: clock.now }),
    );

    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(stub.calls).toHaveLength(2);

    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(stub.calls).toHaveLength(2);

    clock.advance(1000);
    healthy = true;
    const result = await gateway.chat(cleanMessages);

    expect(result.provider).toBe("primary");
    expect(stub.calls).toHaveLength(3);
  });

  test("an open primary circuit short-circuits straight to the fallback", async () => {
    const clock = makeClock();
    const stub = makeFetchStub((url) =>
      url.includes("primary") ? jsonResponse({ error: "boom" }, 500) : jsonResponse(chatOk),
    );
    const gateway = new LlmGateway(
      TEST_CONFIG({ maxRetries: 0, circuit: { failureThreshold: 1, cooldownMs: 1000 } }),
      TEST_DEPS({ fetch: stub.fn, now: clock.now }),
    );

    await gateway.chat(cleanMessages);
    await gateway.chat(cleanMessages);

    const primaryCalls = stub.calls.filter((call) => call.url.includes("primary"));
    expect(primaryCalls).toHaveLength(1);
    expect(stub.calls).toHaveLength(3);
  });
});

describe("LlmGateway metering + audit", () => {
  test("emits a redacted record: 64-hex promptHash and none of the raw prompt text", async () => {
    const records: LlmCallRecord[] = [];
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(
      TEST_CONFIG(),
      TEST_DEPS({ fetch: stub.fn, onCall: (record) => records.push(record) }),
    );

    await gateway.chat([{ role: "user", content: "ACME SOL confidential business plan" }]);

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record?.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.ok).toBe(true);
    expect(record?.costUsd).toBe(computeCostUsd("primary-model", 1000, 500));
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("ACME");
    expect(serialized).not.toContain("confidential");
    expect(serialized).not.toContain("business plan");
  });

  test("records a final failure with zero tokens", async () => {
    const records: LlmCallRecord[] = [];
    const stub = makeFetchStub(() => jsonResponse({ error: "boom" }, 500));
    const gateway = new LlmGateway(
      TEST_CONFIG({ maxRetries: 0 }),
      TEST_DEPS({ fetch: stub.fn, onCall: (record) => records.push(record) }),
    );

    await expect(gateway.chat(cleanMessages)).rejects.toBeInstanceOf(LlmUnavailableError);

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.ok === false && record.costUsd === 0)).toBe(true);
  });
});

describe("LlmGateway PII guard", () => {
  test.each([
    ["an e-mail", "reach me at jane.doe@example.com"],
    ["a phone number", "call +86 138 0013 8000 today"],
    ["a contactId", "contact_id: ckq1234567890abcdefghijklm"],
  ])("rejects a message containing %s before any network call", async (_label, content) => {
    const stub = makeFetchStub(() => {
      throw new Error("network must not be reached");
    });
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.chat([{ role: "user", content }])).rejects.toBeInstanceOf(LlmPiiError);
    expect(stub.calls).toHaveLength(0);
  });

  test("rejects a denylisted context key, including nested ones", async () => {
    const stub = makeFetchStub(() => {
      throw new Error("network must not be reached");
    });
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    await expect(
      gateway.chat(cleanMessages, { context: { contactName: "Jane" } }),
    ).rejects.toBeInstanceOf(LlmPiiError);
    await expect(
      gateway.chat(cleanMessages, { context: { business: { email: "jane@example.com" } } }),
    ).rejects.toBeInstanceOf(LlmPiiError);
    expect(stub.calls).toHaveLength(0);
  });

  test("does not echo the offending value in the error message", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.chat([{ role: "user", content: "jane.doe@example.com" }])).rejects.toThrow(
      /email detected/,
    );
    await gateway
      .chat([{ role: "user", content: "jane.doe@example.com" }])
      .catch((error: unknown) => {
        expect(String(error)).not.toContain("jane.doe@example.com");
      });
  });
});

describe("buildChatRequestBody", () => {
  test("is deterministic and omits unset fields", () => {
    const body = buildChatRequestBody("m1", cleanMessages, {});
    expect(body).toEqual({
      model: "m1",
      messages: [{ role: "user", content: "ACME SOL, class 25, US" }],
      stream: false,
    });
  });

  test("maps json/temperature/maxTokens and preserves key order", () => {
    const body = buildChatRequestBody("m1", [{ role: "system", content: "s" }], {
      temperature: 0,
      json: true,
      maxTokens: 512,
    });
    expect(body).toMatchInlineSnapshot(`
      {
        "max_tokens": 512,
        "messages": [
          {
            "content": "s",
            "role": "system",
          },
        ],
        "model": "m1",
        "response_format": {
          "type": "json_object",
        },
        "stream": false,
        "temperature": 0,
      }
    `);
  });
});

describe("LlmGateway.embed", () => {
  test("posts to {embedUrl}/embeddings and meters the usage", async () => {
    const stub = makeFetchStub(() =>
      jsonResponse({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: 8 } }),
    );
    const gateway = new LlmGateway(
      TEST_CONFIG({ models: { embeddings: "bge-m3" } }),
      TEST_DEPS({ fetch: stub.fn }),
    );

    const result = await gateway.embed("ACME class 25");

    expect(stub.calls[0]?.url).toBe("https://embed.test/v1/embeddings");
    expect((stub.calls[0]?.body as { model: string }).model).toBe("bge-m3");
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.provider).toBe("primary");
    expect(result.usage).toEqual({
      model: "bge-m3",
      promptTokens: 8,
      completionTokens: 0,
      costUsd: computeCostUsd("bge-m3", 8, 0),
    });
  });

  test("throws LlmUnavailableError on an embedding outage so /tm/search degrades to trigram", async () => {
    const stub = makeFetchStub(() => jsonResponse({ error: "down" }, 503));
    const gateway = new LlmGateway(TEST_CONFIG({ maxRetries: 0 }), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.embed("ACME")).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  test("throws LlmUnavailableError when no embed URL is configured", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(
      TEST_CONFIG({ embedUrl: undefined }),
      TEST_DEPS({ fetch: stub.fn }),
    );

    await expect(gateway.embed("ACME")).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(stub.calls).toHaveLength(0);
  });

  test("runs the PII scan on the input text", async () => {
    const stub = makeFetchStub(() => jsonResponse(chatOk));
    const gateway = new LlmGateway(TEST_CONFIG(), TEST_DEPS({ fetch: stub.fn }));

    await expect(gateway.embed("13800138000")).rejects.toBeInstanceOf(LlmPiiError);
    expect(stub.calls).toHaveLength(0);
  });
});
