"use client";

import { useTranslations } from "next-intl";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { ScorePanel } from "@/components/score/score";

/**
 * Public screening assessment (M8.1 — anonymous, cached, disclaimed).
 *
 * This surface moved under `[locale]` so it renders a locale-correct `<html lang>`
 * and localised result labels, but nothing about the contract changed: the
 * request is still an unauthenticated GET, the response is still the full
 * assessment envelope, and the disclosure is still rendered by `ScorePanel`,
 * which cannot produce a score without it.
 *
 * Form copy stays English on purpose — it is pre-existing GATE-surface wording,
 * and localising it is not part of this phase.
 */

type Disclaimers = {
  en: string;
  "zh-CN": string;
  "zh-TW": string;
};

type CorpusFreshness = {
  status: "fresh" | "stale" | "unknown";
  ageHours: number | null;
  lastCompletedAt: string | null;
  slaHours: number;
};

type TopCandidate = {
  serialNumber: string;
  markText: string;
  score: number;
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
  riskFlags: string[];
  recommendedNextActions: string[];
  featureSnapshot: {
    query: Record<string, unknown>;
    modelVersion: string;
    topCandidates: TopCandidate[];
  };
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
  const t = useTranslations("score");
  const [formData, setFormData] = useState<FormData>({ mark: "", niceClass: "", goods: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
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
        setResult((await response.json()) as AssessResponse);
      } else if (response.status === 400) {
        const data = (await response.json()) as ErrorResponse;
        setError(data.error ?? "Invalid request");
      } else if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        setError(
          retryAfter === null
            ? "too many requests"
            : `too many requests (Retry-After: ${retryAfter} seconds)`,
        );
      } else {
        setError("Request failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const handleChange =
    (field: keyof FormData) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      setFormData({ ...formData, [field]: e.target.value });
    };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Trademark Assessment (Screening)</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label htmlFor="mark" className="block text-sm font-medium text-ink-700 mb-1">
            Mark text (required)
          </label>
          <input
            type="text"
            id="mark"
            value={formData.mark}
            onChange={handleChange("mark")}
            required
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="niceClass" className="block text-sm font-medium text-ink-700 mb-1">
            Nice class (optional, 1-45)
          </label>
          <input
            type="number"
            id="niceClass"
            min="1"
            max="45"
            value={formData.niceClass}
            onChange={handleChange("niceClass")}
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="goods" className="block text-sm font-medium text-ink-700 mb-1">
            Goods/services (optional)
          </label>
          <textarea
            id="goods"
            value={formData.goods}
            onChange={handleChange("goods")}
            rows={3}
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-brand-700 text-white rounded-md disabled:opacity-50"
        >
          {loading ? "Loading..." : "Assess"}
        </button>
      </form>

      {error === null ? null : (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>
      )}

      {result === null ? null : (
        <ScorePanel
          status={result.status}
          pRegistration={result.pRegistration}
          headlineConfidence={result.headlineConfidence}
          method={result.method}
          corpusFreshnessStatus={result.corpusFreshness.status}
          isLegalAdvice={result.isLegalAdvice}
          riskFlags={result.riskFlags}
          recommendedNextActions={result.recommendedNextActions}
          disclaimers={result.disclaimers}
          modelVersion={result.modelVersion}
          disclaimerVersion={result.disclaimerVersion}
          labels={{
            resultHeading: t("resultHeading"),
            guidanceHeading: t("guidanceHeading"),
            pRegistrationLabel: t("pRegistrationLabel"),
            headlineConfidenceLabel: t("headlineConfidenceLabel"),
            statusLabel: t("statusLabel"),
            methodLabel: t("methodLabel"),
            localeLabel: t("localeLabel"),
            modelVersionLabel: t("modelVersionLabel"),
            disclaimerVersionLabel: t("disclaimerVersionLabel"),
            corpusFreshnessLabel: t("corpusFreshnessLabel"),
            isLegalAdviceLabel: t("isLegalAdviceLabel"),
            notEnoughData: t("notEnoughData"),
            riskFlagsHeading: t("riskFlagsHeading"),
            actionsHeading: t("actionsHeading"),
            disclaimersHeading: t("disclaimersHeading"),
            degradedNotice: t("degradedNotice"),
            noReferences: t("noReferences"),
            referencesHeading: t("referencesHeading"),
          }}
        />
      )}
    </main>
  );
}