import {
  computeCostUsd,
  configFromEnv,
  DEFAULT_MODEL_PRICE,
  MODEL_PRICES,
  priceForModel,
  resolveModel,
} from "./config.js";

const ENV_KEYS = [
  "LLM_PRIMARY_BASE_URL",
  "LLM_PRIMARY_API_KEY",
  "LLM_PRIMARY_MODEL",
  "LLM_FALLBACK_BASE_URL",
  "LLM_FALLBACK_API_KEY",
  "LLM_FALLBACK_MODEL",
  "BGE_EMBED_URL",
] as const;

describe("configFromEnv", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("reads the D-04 primary/embed vars and omits an unset fallback", () => {
    process.env.LLM_PRIMARY_BASE_URL = "https://primary.test/v1";
    process.env.LLM_PRIMARY_API_KEY = "pk";
    process.env.LLM_PRIMARY_MODEL = "deepseek-chat";
    process.env.BGE_EMBED_URL = "https://embed.test/v1";

    expect(configFromEnv()).toEqual({
      primary: { baseUrl: "https://primary.test/v1", apiKey: "pk", model: "deepseek-chat" },
      fallback: undefined,
      embedUrl: "https://embed.test/v1",
    });
  });

  test("assembles the fallback only when its base URL is set", () => {
    process.env.LLM_FALLBACK_BASE_URL = "https://fallback.test/v1";
    process.env.LLM_FALLBACK_API_KEY = "fk";
    process.env.LLM_FALLBACK_MODEL = "glm-4-plus";

    expect(configFromEnv().fallback).toEqual({
      baseUrl: "https://fallback.test/v1",
      apiKey: "fk",
      model: "glm-4-plus",
    });
  });
});

describe("pricing", () => {
  test("returns known prices and the documented default for unknown models", () => {
    expect(priceForModel("deepseek-chat")).toBe(MODEL_PRICES["deepseek-chat"]);
    expect(priceForModel("totally-unknown")).toBe(DEFAULT_MODEL_PRICE);
  });

  test("computes cost per 1M prompt/completion tokens", () => {
    expect(computeCostUsd("deepseek-chat", 1000, 500)).toBeCloseTo(0.00082, 12);
    expect(computeCostUsd("totally-unknown", 1000, 500)).toBeCloseTo(0.0025, 12);
    expect(computeCostUsd("deepseek-chat", 0, 0)).toBe(0);
  });
});

describe("resolveModel", () => {
  const provider = { baseUrl: "u", apiKey: "k", model: "provider-model" };

  test("prefers the explicit override, then the task map, then the provider default", () => {
    const models = { chatbot: "task-model" };
    expect(resolveModel(models, provider, "chatbot", "explicit")).toBe("explicit");
    expect(resolveModel(models, provider, "chatbot")).toBe("task-model");
    expect(resolveModel(models, provider, "suggestions")).toBe("provider-model");
    expect(resolveModel(undefined, provider, "chatbot")).toBe("provider-model");
  });
});
