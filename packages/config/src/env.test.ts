import {
  assertProductionSafety,
  DEV_VAULT_FALLBACK,
  EnvValidationError,
  envSchema,
  loadEnv,
  REJECTED_SESSION_SECRETS,
  type Env,
} from "./env.js";

const validEnv = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "development",
  SESSION_SECRET: "s".repeat(48),
});

const parseEnv = (overrides: NodeJS.ProcessEnv): Env =>
  envSchema.parse({ NODE_ENV: "development", SESSION_SECRET: "s".repeat(48), ...overrides });

const productionOverrides: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  KMS_KEY_ID: "key-2026-09",
  VAULT_MASTER_KEY: "wrapped-data-key",
  DATABASE_URL: "postgresql://user:pass@db.markus.hk:5432/markus",
  REDIS_URL: "rediss://cache.markus.hk:6379",
};

describe("loadEnv", () => {
  test("applies development defaults for core connection settings", () => {
    const env = loadEnv(validEnv());
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3001);
    expect(env.RUN_WORKER).toBe(false);
    expect(env.DATABASE_URL).toBe("postgresql://markus:markus@localhost:5432/markus");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.USPTO_BULK_BASE_URL).toBe("https://data.uspto.gov");
    expect(env.USPTO_RESEARCHER_PRODUCT_ID).toBe("TRCFECO2");
    expect(env.TM_CORPUS_FRESHNESS_HOURS).toBe(26);
    expect(env.USPTO_ASSISTED_LOGIN_ENABLED).toBe(false);
  });

  test("requires NODE_ENV so the production gate cannot be skipped by omission", () => {
    expect(() => loadEnv({ SESSION_SECRET: "s".repeat(48) })).toThrow(/NODE_ENV/);
  });

  test("rejects a missing or short SESSION_SECRET", () => {
    expect(() => loadEnv({ NODE_ENV: "development" })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...validEnv(), SESSION_SECRET: "too-short" })).toThrow(
      /SESSION_SECRET/,
    );
  });

  test("coerces PORT and boolean env vars", () => {
    const env = loadEnv({
      ...validEnv(),
      PORT: "8080",
      RUN_WORKER: "1",
      USPTO_ASSISTED_LOGIN_ENABLED: "true",
    });
    expect(env.PORT).toBe(8080);
    expect(env.RUN_WORKER).toBe(true);
    expect(env.USPTO_ASSISTED_LOGIN_ENABLED).toBe(true);
  });

  test("rejects a non-numeric PORT and a malformed URL", () => {
    expect(() => loadEnv({ ...validEnv(), PORT: "http" })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...validEnv(), REDIS_URL: "not-a-url" })).toThrow(/REDIS_URL/);
  });

  test("rejects non-service URL schemes", () => {
    const unsafe = [
      { PUBLIC_BASE_URL: "javascript:alert(1)" },
      { API_BASE_URL: "file:///etc/passwd" },
      { SENTRY_DSN: "data:text/plain,leak" },
      { LLM_PRIMARY_BASE_URL: "ftp://models.internal" },
      { DATABASE_URL: "https://db.example.com" },
      { REDIS_URL: "http://cache.example.com" },
      { USPTO_BULK_BASE_URL: "http://bulkdata.uspto.gov" },
    ];
    for (const override of unsafe) {
      expect(() => loadEnv({ ...validEnv(), ...override })).toThrow(EnvValidationError);
    }
  });

  test("treats empty optional values as unset", () => {
    const env = loadEnv({ ...validEnv(), STRIPE_SECRET_KEY: "", SENTRY_DSN: "" });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  test("never echoes secret values into the error message", () => {
    const secret = "k".repeat(48);
    try {
      loadEnv({ NODE_ENV: "development", SESSION_SECRET: secret, REDIS_URL: "nope" });
      throw new Error("expected EnvValidationError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as EnvValidationError).problems.join(" ")).not.toContain(secret);
    }
  });
});

describe("assertProductionSafety (D-01)", () => {
  test("accepts a fully configured production environment", () => {
    const env = loadEnv({
      ...validEnv(),
      ...productionOverrides,
    });
    expect(() => assertProductionSafety(env)).not.toThrow();
  });

  test("rejects the development vault fallback outside development", () => {
    const env = parseEnv({
      ...productionOverrides,
      NODE_ENV: "staging",
      VAULT_MASTER_KEY: DEV_VAULT_FALLBACK,
      REDIS_URL: "redis://cache.markus.hk:6379",
    });
    expect(() => assertProductionSafety(env)).toThrow(/development fallback/);
  });

  test("rejects a shipped SESSION_SECRET placeholder outside development", () => {
    for (const placeholder of REJECTED_SESSION_SECRETS) {
      if (placeholder.length < 32) continue;
      const env = parseEnv({ ...productionOverrides, SESSION_SECRET: placeholder });
      expect(() => assertProductionSafety(env)).toThrow(/placeholder/);
    }
  });

  test("rejects missing KMS key and local connection strings in production", () => {
    const env = parseEnv({ NODE_ENV: "production" });
    expect(() => assertProductionSafety(env)).toThrow(/KMS_KEY_ID/);
    expect(() => assertProductionSafety(env)).toThrow(/DATABASE_URL/);
    expect(() => assertProductionSafety(env)).toThrow(/REDIS_URL/);
  });

  test("loadEnv applies the same gate at boot time", () => {
    expect(() => loadEnv({ ...validEnv(), NODE_ENV: "production" })).toThrow(EnvValidationError);
  });

  test("does not enforce production rules in development or test", () => {
    expect(() => assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "test" }))).not.toThrow();
    expect(() =>
      assertProductionSafety(loadEnv({ ...validEnv(), NODE_ENV: "development" })),
    ).not.toThrow();
  });
});
