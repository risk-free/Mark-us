"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { GuidancePanel } from "@/components/score/score";

/**
 * Public guidance assistant (M8.2 — anonymous, disclaimed).
 *
 * Moved under `[locale]` for a locale-correct `<html lang>`; the disclosure
 * envelope it returns and renders is unchanged, and `GuidancePanel` renders the
 * three-locale disclaimer, model version and disclaimer version as one unit.
 *
 * The answer locale is still an explicit, user-chosen field rather than being
 * inherited from the page locale: the API resolves it per request and falls back
 * to zh-CN, and silently overriding a visitor's choice would break that contract.
 * Form copy stays English — pre-existing wording, not part of this phase.
 */

type Disclaimers = {
  en: string;
  "zh-CN": string;
  "zh-TW": string;
};

type Citation = {
  index: number;
  id: string;
  title: string;
  section: string;
  url: string;
  lang: string;
};

type AssistantResponse = {
  status: "ok" | "degraded";
  answer: string | null;
  citations: Citation[];
  locale: string;
  isLegalAdvice: false;
  disclaimer: string;
  disclaimers: Disclaimers;
  disclaimerVersion: string;
  modelVersion: string;
  provider?: string;
  model?: string;
};

type ErrorResponse = {
  error: string;
};

type FormData = {
  mark: string;
  niceClass: string;
  jurisdiction: string;
  businessDescription: string;
  locale: string;
};

export default function AssistantPage() {
  const t = useTranslations("score");
  const pageLocale = useLocale();

  const [formData, setFormData] = useState<FormData>(() => ({
    mark: "",
    niceClass: "",
    jurisdiction: "",
    businessDescription: "",
    // Seeded from the page locale on first render, so a zh-TW reader is not
    // asked in Chinese and then answered in Simplified. It stays an explicit,
    // user-changeable field because the API resolves it per request.
    locale: pageLocale,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
      const body: Record<string, unknown> = { markText: formData.mark.trim() };

      const niceClassNum = Number(formData.niceClass);
      if (
        formData.niceClass.trim() !== "" &&
        Number.isInteger(niceClassNum) &&
        niceClassNum >= 1 &&
        niceClassNum <= 45
      ) {
        body.classCodes = [Number(String(niceClassNum).padStart(3, "0"))];
      }
      if (formData.jurisdiction.trim() !== "") {
        body.jurisdiction = formData.jurisdiction.trim();
      }
      if (formData.businessDescription.trim() !== "") {
        body.businessDescription = formData.businessDescription.trim();
      }
      body.locale = formData.locale;

      const response = await fetch(`${apiBaseUrl}/tm/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setResult((await response.json()) as AssistantResponse);
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
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
      setFormData({ ...formData, [field]: e.target.value });
    };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Trademark Guidance Assistant</h1>

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
          <label htmlFor="jurisdiction" className="block text-sm font-medium text-ink-700 mb-1">
            Jurisdiction (optional)
          </label>
          <input
            type="text"
            id="jurisdiction"
            value={formData.jurisdiction}
            onChange={handleChange("jurisdiction")}
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="businessDescription" className="block text-sm font-medium text-ink-700 mb-1">
            Business description (optional)
          </label>
          <textarea
            id="businessDescription"
            value={formData.businessDescription}
            onChange={handleChange("businessDescription")}
            rows={3}
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-ink-700 mb-1">
            Answer locale
          </label>
          <select
            id="locale"
            value={formData.locale}
            onChange={handleChange("locale")}
            className="w-full px-3 py-2 border border-ink-300 rounded-md"
          >
            <option value="en">en</option>
            <option value="zh-CN">zh-CN</option>
            <option value="zh-TW">zh-TW</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-brand-700 text-white rounded-md disabled:opacity-50"
        >
          {loading ? "Loading..." : "Ask"}
        </button>
      </form>

      {error === null ? null : (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>
      )}

      {result === null ? null : (
        <GuidancePanel
          status={result.status}
          answer={result.answer}
          locale={result.locale}
          provider={result.provider}
          model={result.model}
          citations={result.citations}
          isLegalAdvice={result.isLegalAdvice}
          disclaimers={result.disclaimers}
          disclaimerVersion={result.disclaimerVersion}
          modelVersion={result.modelVersion}
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