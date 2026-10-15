import { CircuitBreaker, DEFAULT_CIRCUIT_CONFIG } from "./circuit.js";
import { makeClock } from "./testkit.js";

const config = { failureThreshold: 2, cooldownMs: 1000 };

describe("CircuitBreaker", () => {
  test("starts closed and exposes the documented defaults", () => {
    expect(new CircuitBreaker().state).toBe("closed");
    expect(DEFAULT_CIRCUIT_CONFIG).toEqual({ failureThreshold: 5, cooldownMs: 10_000 });
  });

  test("opens after the failure threshold and short-circuits while open", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker(config, clock.now);

    breaker.onFailure();
    expect(breaker.canAttempt()).toBe(true);
    breaker.onFailure();

    expect(breaker.state).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  test("half-opens after cooldown and closes on a successful trial", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker(config, clock.now);
    breaker.onFailure();
    breaker.onFailure();

    clock.advance(1000);
    expect(breaker.state).toBe("half-open");
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(false);

    breaker.onSuccess();
    expect(breaker.state).toBe("closed");
    expect(breaker.canAttempt()).toBe(true);
  });

  test("re-opens when the half-open trial fails", () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker(config, clock.now);
    breaker.onFailure();
    breaker.onFailure();

    clock.advance(1000);
    expect(breaker.canAttempt()).toBe(true);
    breaker.onFailure();

    expect(breaker.state).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
    clock.advance(999);
    expect(breaker.canAttempt()).toBe(false);
    clock.advance(1);
    expect(breaker.canAttempt()).toBe(true);
  });

  test("resets the failure count on success", () => {
    const breaker = new CircuitBreaker(config, () => 0);
    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();
    expect(breaker.state).toBe("closed");
  });
});
