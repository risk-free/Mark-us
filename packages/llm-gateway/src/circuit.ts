/**
 * Per-provider circuit breaker (D-04, M6.4).
 *
 * Opens after `failureThreshold` consecutive failures, stays open for
 * `cooldownMs`, then admits a single half-open trial. While open, calls skip the
 * provider — the gateway then tries the fallback or fails typed. All timing is
 * driven by an injected clock so tests never touch wall time (M13.6).
 */

export interface CircuitConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  cooldownMs: 10_000,
};

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  readonly #config: CircuitConfig;
  readonly #now: () => number;
  #failures = 0;
  #openedAt: number | null = null;
  #trialing = false;

  constructor(config: CircuitConfig = DEFAULT_CIRCUIT_CONFIG, now: () => number = Date.now) {
    this.#config = config;
    this.#now = now;
  }

  get state(): CircuitState {
    if (this.#openedAt === null) return "closed";
    return this.#now() - this.#openedAt >= this.#config.cooldownMs ? "half-open" : "open";
  }

  /** True when a call may proceed; claims the single half-open trial slot. */
  canAttempt(): boolean {
    if (this.#openedAt === null) return true;
    if (this.#now() - this.#openedAt < this.#config.cooldownMs) return false;
    if (this.#trialing) return false;
    this.#trialing = true;
    return true;
  }

  onSuccess(): void {
    this.#failures = 0;
    this.#openedAt = null;
    this.#trialing = false;
  }

  onFailure(): void {
    this.#trialing = false;
    if (this.#openedAt !== null) {
      this.#openedAt = this.#now();
      return;
    }
    this.#failures += 1;
    if (this.#failures >= this.#config.failureThreshold) {
      this.#openedAt = this.#now();
    }
  }
}
