/**
 * Knowledge-base contract (P6.2, mandates M6.3/M6.4).
 *
 * A KB entry is a curated, public, non-PII fragment of USPTO trademark guidance.
 * Entries are grouped by a locale-independent `topic` so a translation can stand
 * in for its English original during retrieval when the caller's locale has no
 * dedicated copy. Nothing here is client data: only mark text, class,
 * jurisdiction and business description ever reach the prompt (rule G3).
 */

/** Locales the KB and prompt builders understand (M6.2's 3-locale set). */
export const KB_LOCALES = ["en", "zh-CN", "zh-TW"] as const;

export type KbLocale = (typeof KB_LOCALES)[number];

/** Curated buckets the guidance is organised into. */
export type KbSection =
  | "basics"
  | "classification"
  | "filing"
  | "office-actions"
  | "response"
  | "pitfalls"
  | "jurisdiction";

export interface KbEntry {
  /** Stable, unique, human-readable id (locale suffix for translations). */
  id: string;
  title: string;
  section: KbSection;
  /** Official public source page (conceptual citation target). */
  url: string;
  lang: KbLocale;
  text: string;
  /** Locale-independent logical key; translations of one fact share a topic. */
  topic: string;
}

/**
 * Resolve any locale tag to one of the three supported prompt/KB locales.
 * Unknown or absent tags fall back to English rather than throwing, so a caller
 * can never be blocked by an unexpected `Accept-Language` value.
 */
export function resolveKbLocale(locale?: string): KbLocale {
  if (locale === undefined || locale.trim() === "") return "en";
  const value = locale.trim().toLowerCase().replace(/_/g, "-");
  if (value === "zh" || value === "zh-cn" || value === "zh-hans") return "zh-CN";
  if (value === "zh-tw" || value === "zh-hant" || value === "zh-hk" || value === "zh-mo") {
    return "zh-TW";
  }
  return "en";
}
