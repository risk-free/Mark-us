/**
 * Mandatory probability disclaimers (P5.5, mandates M6.2 / G6, ADR D-03).
 *
 * Every payload that carries a probability, a similarity score or a
 * recommendation must ship the model version, the disclaimer version and the
 * **3-locale** disclaimer text (zh-CN / en / zh-TW). The text is a versioned
 * constant: bump `DISCLAIMER_VERSION` whenever any locale's copy changes, so a
 * stored assessment can always name the exact wording it was shown.
 *
 * D-03 requires four points in every locale: not legal advice; not a guarantee;
 * examiner discretion; attorney review available.
 */

export type DisclaimerLocale = "en" | "zh-CN" | "zh-TW";

export const SUPPORTED_LOCALES: readonly DisclaimerLocale[] = ["en", "zh-CN", "zh-TW"];

/** Bumped whenever the disclaimer copy changes; stamped on every assessment (M6.2). */
export const DISCLAIMER_VERSION = "disclaimer-1.0.0";

export interface Disclaimer {
  locale: DisclaimerLocale;
  version: string;
  /** The four D-03 points, in order, for structured rendering. */
  points: readonly string[];
  /** The four points joined for a single-line fallback. */
  text: string;
}

const EN_POINTS = [
  "This is not legal advice.",
  "It is not a guarantee of registrability or registration.",
  "The examiner exercises discretion; the actual outcome may differ.",
  "A qualified trademark attorney can review this result with you.",
] as const;

const ZH_CN_POINTS = [
  "本结果不构成法律意见。",
  "本结果不保证商标的可注册性或注册成功。",
  "审查员拥有自由裁量权，实际结果可能不同。",
  "您可委托合资格商标律师审阅本结果。",
] as const;

const ZH_TW_POINTS = [
  "本結果不構成法律意見。",
  "本結果不保證商標的可註冊性或註冊成功。",
  "審查員擁有裁量權，實際結果可能不同。",
  "您可委任合資格商標律師審閱本結果。",
] as const;

const build = (locale: DisclaimerLocale, points: readonly string[]): Disclaimer => ({
  locale,
  version: DISCLAIMER_VERSION,
  points,
  text: points.join(" "),
});

export const DISCLAIMERS: Record<DisclaimerLocale, Disclaimer> = {
  en: build("en", EN_POINTS),
  "zh-CN": build("zh-CN", ZH_CN_POINTS),
  "zh-TW": build("zh-TW", ZH_TW_POINTS),
};

/** The disclaimer for `locale`, defaulting to English for an unknown locale. */
export function disclaimerFor(locale: string): Disclaimer {
  return DISCLAIMERS[locale as DisclaimerLocale] ?? DISCLAIMERS.en;
}

/** All locales' text keyed by locale — the M6.2 payload shape. */
export function disclaimersByLocale(): Record<DisclaimerLocale, string> {
  return {
    en: DISCLAIMERS.en.text,
    "zh-CN": DISCLAIMERS["zh-CN"].text,
    "zh-TW": DISCLAIMERS["zh-TW"].text,
  };
}
