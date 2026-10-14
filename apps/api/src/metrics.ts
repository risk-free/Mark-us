/**
 * Prometheus metrics registry (P5.6, mandate M8.1 / ARCH-01 §14).
 *
 * Label allow-list only: route labels are the registered route template (or
 * `unknown`), never a raw URL, query string or IP. Durations use a small fixed
 * bucket set so the exposition stays cheap to scrape.
 */

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30] as const;

interface HistogramState {
  readonly buckets: number[];
  sum: number;
  count: number;
}

interface HttpCounter {
  route: string;
  method: string;
  status: number;
  count: number;
}

const newHistogram = (): HistogramState => ({
  buckets: DURATION_BUCKETS.map(() => 0),
  sum: 0,
  count: 0,
});

const observeInto = (state: HistogramState, value: number): void => {
  state.sum += value;
  state.count += 1;
  for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
    if (value <= DURATION_BUCKETS[index]!) state.buckets[index] = (state.buckets[index] ?? 0) + 1;
  }
};

const escapeLabelValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

const safeRoute = (route: string): string => {
  if (/^[a-z]+:\/\//i.test(route)) return "unknown";
  const [path] = route.split("?");
  return path && path.startsWith("/") ? path : "unknown";
};

export class MetricsRegistry {
  readonly #httpCounters = new Map<string, HttpCounter>();
  readonly #httpHistograms = new Map<string, HistogramState>();
  readonly #assessmentHistogram = newHistogram();
  #cacheHits = 0;
  #cacheMisses = 0;

  observeHttp(route: string, method: string, status: number, durationSeconds: number): void {
    const safe = safeRoute(route);
    const key = `${safe}\u0000${method}\u0000${status}`;
    const counter = this.#httpCounters.get(key);
    if (counter) {
      counter.count += 1;
    } else {
      this.#httpCounters.set(key, { route: safe, method, status, count: 1 });
    }

    const histogram = this.#httpHistograms.get(safe) ?? newHistogram();
    observeInto(histogram, durationSeconds);
    this.#httpHistograms.set(safe, histogram);
  }

  observeAssessment(durationSeconds: number, cached: boolean): void {
    observeInto(this.#assessmentHistogram, durationSeconds);
    if (cached) {
      this.#cacheHits += 1;
    } else {
      this.#cacheMisses += 1;
    }
  }

  render(): string {
    const lines: string[] = [];

    lines.push("# HELP http_requests_total Total HTTP requests by route template, method and status.");
    lines.push("# TYPE http_requests_total counter");
    const counters = [...this.#httpCounters.values()].sort(
      (a, b) =>
        a.route.localeCompare(b.route) ||
        a.method.localeCompare(b.method) ||
        a.status - b.status,
    );
    for (const counter of counters) {
      lines.push(
        `http_requests_total{method="${escapeLabelValue(counter.method)}",route="${escapeLabelValue(counter.route)}",status="${counter.status}"} ${counter.count}`,
      );
    }

    lines.push("# HELP http_duration_seconds HTTP request duration in seconds by route template.");
    lines.push("# TYPE http_duration_seconds histogram");
    for (const [route, state] of this.#sortedHistograms()) {
      for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
        lines.push(
          `http_duration_seconds_bucket{le="${DURATION_BUCKETS[index]}",route="${escapeLabelValue(route)}"} ${state.buckets[index]}`,
        );
      }
      lines.push(
        `http_duration_seconds_bucket{le="+Inf",route="${escapeLabelValue(route)}"} ${state.count}`,
      );
      lines.push(`http_duration_seconds_sum{route="${escapeLabelValue(route)}"} ${state.sum}`);
      lines.push(`http_duration_seconds_count{route="${escapeLabelValue(route)}"} ${state.count}`);
    }

    lines.push("# HELP assessment_duration_seconds Assessment scoring duration in seconds.");
    lines.push("# TYPE assessment_duration_seconds histogram");
    for (let index = 0; index < DURATION_BUCKETS.length; index += 1) {
      lines.push(
        `assessment_duration_seconds_bucket{le="${DURATION_BUCKETS[index]}"} ${this.#assessmentHistogram.buckets[index]}`,
      );
    }
    lines.push(
      `assessment_duration_seconds_bucket{le="+Inf"} ${this.#assessmentHistogram.count}`,
    );
    lines.push(`assessment_duration_seconds_sum ${this.#assessmentHistogram.sum}`);
    lines.push(`assessment_duration_seconds_count ${this.#assessmentHistogram.count}`);

    lines.push("# HELP assessment_cache_hits_total Assessments served from the 24 h cache.");
    lines.push("# TYPE assessment_cache_hits_total counter");
    lines.push(`assessment_cache_hits_total ${this.#cacheHits}`);

    lines.push("# HELP assessment_cache_misses_total Assessments that reached the scorer.");
    lines.push("# TYPE assessment_cache_misses_total counter");
    lines.push(`assessment_cache_misses_total ${this.#cacheMisses}`);

    return `${lines.join("\n")}\n`;
  }

  #sortedHistograms(): Array<[string, HistogramState]> {
    return [...this.#httpHistograms.entries()].sort(([a], [b]) => a.localeCompare(b));
  }
}
