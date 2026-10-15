"use client";

import { useState, type FormEvent } from "react";

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

type Locale = "en" | "zh-CN" | "zh-TW";

type FormData = {
  mark: string;
  niceClass: string;
  jurisdiction: string;
  businessDescription: string;
  locale: Locale;
};

export default function AssistantPage() {
  const [formData, setFormData] = useState<FormData>({
    mark: "",
    niceClass: "",
    jurisdiction: "",
    businessDescription: "",
    locale: "zh-CN",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantResponse | null>(null);

  const handleSubmit = async (e: FormEvent) => {
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
        const data = (await response.json()) as AssistantResponse;
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

  const handleChange =
    (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormData({ ...formData, [field]: e.target.value });
    };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Trademark Guidance Assistant</h1>

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
          <label htmlFor="jurisdiction" className="block text-sm font-medium text-gray-700 mb-1">
            Jurisdiction (optional)
          </label>
          <input
            type="text"
            id="jurisdiction"
            value={formData.jurisdiction}
            onChange={handleChange("jurisdiction")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="businessDescription" className="block text-sm font-medium text-gray-700 mb-1">
            Business description (optional)
          </label>
          <textarea
            id="businessDescription"
            value={formData.businessDescription}
            onChange={handleChange("businessDescription")}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="locale" className="block text-sm font-medium text-gray-700 mb-1">
            Answer locale
          </label>
          <select
            id="locale"
            value={formData.locale}
            onChange={handleChange("locale")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="en">en</option>
            <option value="zh-CN">zh-CN</option>
            <option value="zh-TW">zh-TW</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
        >
          {loading ? "Loading..." : "Ask"}
        </button>
      </form>

      {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

      {result && (
        <div className="space-y-6">
          <section className="p-4 border border-gray-200 rounded-md">
            <h2 className="text-xl font-semibold mb-3">Guidance</h2>
            {result.status === "degraded" || result.answer === null ? (
              <p className="text-gray-700">guidance unavailable — see references below</p>
            ) : (
              <p className="whitespace-pre-wrap">{result.answer}</p>
            )}
            <div className="mt-4 space-y-2 text-sm">
              <div>
                <span className="font-medium">Status:</span> {result.status}
              </div>
              <div>
                <span className="font-medium">Locale:</span> {result.locale}
              </div>
              <div>
                <span className="font-medium">Model version:</span> {result.modelVersion}
              </div>
              <div>
                <span className="font-medium">Disclaimer version:</span> {result.disclaimerVersion}
              </div>
              <div>
                <span className="font-medium">isLegalAdvice:</span> {String(result.isLegalAdvice)}
              </div>
            </div>
          </section>

          <section className="p-4 border border-gray-200 rounded-md">
            <h3 className="text-lg font-medium mb-2">References</h3>
            {result.citations.length === 0 ? (
              <p className="text-sm text-gray-700">No references returned.</p>
            ) : (
              <ul className="list-disc pl-6">
                {result.citations.map((citation) => (
                  <li key={citation.index}>
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {citation.title}
                    </a>{" "}
                    <span className="text-sm text-gray-500">{citation.url}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="p-4 border border-gray-200 rounded-md bg-gray-50">
            <h3 className="text-lg font-medium mb-3">Disclaimers (all three locales)</h3>
            <div className="space-y-4">
              <div>
                <div className="font-medium text-sm mb-1">en</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{result.disclaimers.en}</div>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">zh-CN</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {result.disclaimers["zh-CN"]}
                </div>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">zh-TW</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {result.disclaimers["zh-TW"]}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
