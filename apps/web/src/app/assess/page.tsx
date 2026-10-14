"use client";

import { useState, type FormEvent } from "react";

type Disclaimers = {
  en: string;
  "zh-CN": string;
  "zh-TW": string;
};

type SubSignals = {
  candidateCount: number;
  maxTrigram: number;
  maxPhonetic: number;
  minClassDistance: number;
  goodsMax: number;
};

type TopCandidate = {
  serialNumber: string;
  markText: string;
  score: number;
};

type FeatureSnapshot = {
  query: Record<string, unknown>;
  modelVersion: string;
  topCandidates: TopCandidate[];
};

type CorpusFreshness = {
  status: "fresh" | "stale" | "unknown";
  ageHours: number | null;
  lastCompletedAt: string | null;
  slaHours: number;
};

type AssessResponse = {
  status: "scored" | "INSUFFICIENT_DATA";
  pRegistration: number | null;
  method: "trigram" | "bge" | "hybrid";
  isLegalAdvice: false;
  disclaimer: string;
  disclaimers: Disclaimers;
  disclaimerVersion: string;
  modelVersion: string;
  headlineConfidence: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT_DATA";
  subSignals: SubSignals;
  riskFlags: string[];
  recommendedNextActions: string[];
  featureSnapshot: FeatureSnapshot;
  corpusFreshness: CorpusFreshness;
};

type ErrorResponse = {
  error: string;
};

type FormData = {
  mark: string;
  niceClass: string;
  goods: string;
};

export default function AssessPage() {
  const [formData, setFormData] = useState<FormData>({
    mark: "",
    niceClass: "",
    goods: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
      const params = new URLSearchParams();

      params.append("q", formData.mark.trim());
      const niceClassNum = Number(formData.niceClass);
      if (formData.niceClass.trim() !== "" && !isNaN(niceClassNum) && niceClassNum >= 1 && niceClassNum <= 45) {
        params.append("niceClass", String(niceClassNum).padStart(3, "0"));
      }
      if (formData.goods.trim() !== "") {
        params.append("goods", formData.goods.trim());
      }

      const response = await fetch(`${apiBaseUrl}/tm/assess?${params.toString()}`);

      if (response.ok) {
        const data = (await response.json()) as AssessResponse;
        setResult(data);
      } else if (response.status === 400) {
        const data = (await response.json()) as ErrorResponse;
        setError(data.error ?? "Invalid request");
      } else if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          setError(`too many requests (Retry-After: ${retryAfter} seconds)`);
        } else {
          setError("too many requests");
        }
      } else {
        setError("Request failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const formatPRegistration = (val: number | null, status: string, headlineConfidence: string) => {
    if (status === "INSUFFICIENT_DATA" || headlineConfidence === "INSUFFICIENT_DATA") {
      return "Not enough data";
    }
    if (val === null) {
      return "Not enough data";
    }
    return `${Math.round(val * 100)}%`;
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Trademark Assessment (Screening)</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label htmlFor="mark" className="block text-sm font-medium text-gray-700 mb-1">
            Mark text (required)
          </label>
          <input
            type="text"
            id="mark"
            value={formData.mark}
            onChange={handleChange("mark")}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="niceClass" className="block text-sm font-medium text-gray-700 mb-1">
            Nice class (optional, 1-45)
          </label>
          <input
            type="number"
            id="niceClass"
            min="1"
            max="45"
            value={formData.niceClass}
            onChange={handleChange("niceClass")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="goods" className="block text-sm font-medium text-gray-700 mb-1">
            Goods/services (optional)
          </label>
          <textarea
            id="goods"
            value={formData.goods}
            onChange={handleChange("goods")}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          {loading ? "Loading..." : "Assess"}
        </button>
      </form>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

      {result && (
        <div className="space-y-6">
          <section className="p-4 border border-gray-200 rounded-md">
            <h2 className="text-xl font-semibold mb-3">Screening Result</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">pRegistration (screening signal):</span>{" "}
                {formatPRegistration(result.pRegistration, result.status, result.headlineConfidence)}
              </div>
              <div>
                <span className="font-medium">Headline confidence:</span> {result.headlineConfidence}
              </div>
              <div>
                <span className="font-medium">Status:</span> {result.status}
              </div>
              <div>
                <span className="font-medium">Method:</span> {result.method}
              </div>
              <div>
                <span className="font-medium">Model version:</span> {result.modelVersion}
              </div>
              <div>
                <span className="font-medium">Disclaimer version:</span> {result.disclaimerVersion}
              </div>
              <div>
                <span className="font-medium">Corpus freshness:</span> {result.corpusFreshness.status}
              </div>
              <div>
                <span className="font-medium">isLegalAdvice:</span> {String(result.isLegalAdvice)}
              </div>
            </div>
          </section>

          {result.riskFlags && result.riskFlags.length > 0 && (
            <section className="p-4 border border-gray-200 rounded-md">
              <h3 className="text-lg font-medium mb-2">Risk flags</h3>
              <ul className="list-disc pl-6">
                {result.riskFlags.map((flag, idx) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            </section>
          )}

          {result.recommendedNextActions && result.recommendedNextActions.length > 0 && (
            <section className="p-4 border border-gray-200 rounded-md">
              <h3 className="text-lg font-medium mb-2">Recommended next actions</h3>
              <ul className="list-disc pl-6">
                {result.recommendedNextActions.map((action, idx) => (
                  <li key={idx}>{action}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="p-4 border border-gray-200 rounded-md bg-gray-50">
            <h3 className="text-lg font-medium mb-3">Disclaimers (all three locales)</h3>
            <div className="space-y-4">
              <div>
                <div className="font-medium text-sm mb-1">en</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{result.disclaimers.en}</div>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">zh-CN</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{result.disclaimers["zh-CN"]}</div>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">zh-TW</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{result.disclaimers["zh-TW"]}</div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}