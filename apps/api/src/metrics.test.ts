import { METRICS_CONTENT_TYPE, MetricsRegistry } from "./metrics.js";

describe("MetricsRegistry", () => {
  test("renders Prometheus text with counters, histograms and labelled samples", () => {
    const registry = new MetricsRegistry();
    registry.observeHttp("/tm/assess", "GET", 200, 0.12);
    registry.observeHttp("/tm/assess", "GET", 200, 0.42);
    registry.observeAssessment(0.5, false);
    registry.observeAssessment(0.02, true);

    const text = registry.render();

    expect(text).toContain("# HELP http_requests_total");
    expect(text).toContain("# TYPE http_requests_total counter");
    expect(text).toContain(
      'http_requests_total{method="GET",route="/tm/assess",status="200"} 2',
    );
    expect(text).toContain("# TYPE http_duration_seconds histogram");
    expect(text).toContain('http_duration_seconds_bucket{le="0.05",route="/tm/assess"} 0');
    expect(text).toContain('http_duration_seconds_bucket{le="+Inf",route="/tm/assess"} 2');
    expect(text).toContain("# TYPE assessment_duration_seconds histogram");
    expect(text).toContain("assessment_duration_seconds_count 2");
    expect(text).toContain("assessment_cache_hits_total 1");
    expect(text).toContain("assessment_cache_misses_total 1");
    expect(METRICS_CONTENT_TYPE).toBe("text/plain; version=0.0.4; charset=utf-8");
  });

  test("never leaks a raw URL or query string into route labels", () => {
    const registry = new MetricsRegistry();
    registry.observeHttp("/tm/assess?q=SECRET-MARK&niceClass=9", "GET", 200, 0.1);
    registry.observeHttp("https://api.markus.hk/tm/assess?token=abc", "GET", 200, 0.1);

    const text = registry.render();

    expect(text).not.toContain("SECRET-MARK");
    expect(text).not.toContain("token=abc");
    expect(text).toContain('route="/tm/assess"');
    expect(text).toContain('route="unknown"');
  });

  test("histogram bucket counts are cumulative", () => {
    const registry = new MetricsRegistry();
    registry.observeHttp("/health", "GET", 200, 0.02);
    registry.observeHttp("/health", "GET", 200, 0.3);

    const text = registry.render();
    expect(text).toContain('http_duration_seconds_bucket{le="0.05",route="/health"} 1');
    expect(text).toContain('http_duration_seconds_bucket{le="0.25",route="/health"} 1');
    expect(text).toContain('http_duration_seconds_bucket{le="0.5",route="/health"} 2');
    expect(text).toContain('http_duration_seconds_bucket{le="+Inf",route="/health"} 2');
  });
});
