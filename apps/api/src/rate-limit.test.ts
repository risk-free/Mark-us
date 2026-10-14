import { clientIp, InMemoryRateLimiter } from "./rate-limit.js";

describe("InMemoryRateLimiter", () => {
  test("allows up to the limit then blocks with a sane retryAfter", async () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(() => now);

    const first = await limiter.consume("k", 2, 60);
    expect(first).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 60 });

    const second = await limiter.consume("k", 2, 60);
    expect(second).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 60 });

    now = 1_000;
    const third = await limiter.consume("k", 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(third.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test("resets the counter once the window expires", async () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(() => now);

    expect((await limiter.consume("k", 1, 60)).allowed).toBe(true);
    expect((await limiter.consume("k", 1, 60)).allowed).toBe(false);

    now = 60_000;
    const reset = await limiter.consume("k", 1, 60);
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(0);
  });

  test("tracks keys independently", async () => {
    const limiter = new InMemoryRateLimiter();
    expect((await limiter.consume("a", 1, 60)).allowed).toBe(true);
    expect((await limiter.consume("b", 1, 60)).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  test("returns the first hop of x-forwarded-for", () => {
    expect(clientIp("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(clientIp("203.0.113.7")).toBe("203.0.113.7");
  });

  test("falls back to unknown when absent or blank", () => {
    expect(clientIp(undefined)).toBe("unknown");
    expect(clientIp("")).toBe("unknown");
    expect(clientIp("   ")).toBe("unknown");
    expect(clientIp(", 10.0.0.1")).toBe("unknown");
  });
});
