import en from "@/messages/en.json";
import zhCN from "@/messages/zh-CN.json";
import zhTW from "@/messages/zh-TW.json";
import { LOCALES, type Locale } from "./locales";

/**
 * Runtime i18n parity.
 *
 * `scripts/check-i18n-parity.mjs` is the CI gate and works off the files on disk;
 * this suite is the same invariant expressed where a developer will actually see
 * it fail, plus the type-level guarantee that a *missing* key fails `tsc`.
 */

const CATALOGS: Record<Locale, unknown> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
};

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    out[prefix] = value.join(" ");
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
  }
  return out;
}

const flat = Object.fromEntries(
  Object.entries(CATALOGS).map(([locale, catalog]) => [locale, flatten(catalog)]),
) as Record<Locale, Record<string, string>>;

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();
}

describe("i18n key parity (SCHEDULE 1.3)", () => {
  it.each(LOCALES)("%s has the same key set as en", (locale) => {
    expect(Object.keys(flat[locale]).sort()).toEqual(Object.keys(flat.en).sort());
  });

  it.each(LOCALES)("%s has no blank value", (locale) => {
    const blanks = Object.entries(flat[locale])
      .filter(([, value]) => value.trim() === "")
      .map(([key]) => key);
    expect(blanks).toEqual([]);
  });

  it("keeps interpolation placeholders identical across locales", () => {
    const mismatches: string[] = [];

    for (const key of Object.keys(flat.en)) {
      const expected = placeholders(flat.en[key] ?? "").join(",");
      for (const locale of LOCALES) {
        const actual = placeholders(flat[locale][key] ?? "").join(",");
        if (actual !== expected) mismatches.push(`${locale}:${key}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("keeps the zh-CN and zh-TW catalogs genuinely different", () => {
    // Guards against a copy-paste that satisfies parity but ships the wrong script.
    const simplifiedOnly = flat["zh-CN"]["about.mission.body"];
    const traditionalOnly = flat["zh-TW"]["about.mission.body"];
    expect(simplifiedOnly).not.toBe(traditionalOnly);
  });
});

describe("message catalogs are wired for the score surfaces", () => {
  it("ships every label ScoreLabels requires, in all three locales", () => {
    const required = [
      "resultHeading",
      "guidanceHeading",
      "pRegistrationLabel",
      "headlineConfidenceLabel",
      "statusLabel",
      "methodLabel",
      "localeLabel",
      "modelVersionLabel",
      "disclaimerVersionLabel",
      "corpusFreshnessLabel",
      "isLegalAdviceLabel",
      "notEnoughData",
      "riskFlagsHeading",
      "actionsHeading",
      "disclaimersHeading",
      "degradedNotice",
      "noReferences",
      "referencesHeading",
    ];

    for (const locale of LOCALES) {
      const missing = required.filter((key) => flat[locale][`score.${key}`] === undefined);
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });
});