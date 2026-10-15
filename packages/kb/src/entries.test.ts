import { scanText } from "@markus/llm-gateway";

import { KB_ENTRIES } from "./entries.js";
import { KB_LOCALES, resolveKbLocale } from "./types.js";

describe("KB data", () => {
  test("every entry has a unique id and a resolvable source URL", () => {
    const ids = new Set<string>();
    for (const entry of KB_ENTRIES) {
      expect(entry.id).not.toBe("");
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.text.length).toBeGreaterThan(40);
      expect(entry.title.length).toBeGreaterThan(0);
    }
  });

  test("every locale has an entry and translations share a topic", () => {
    for (const locale of KB_LOCALES) {
      expect(KB_ENTRIES.some((entry) => entry.lang === locale)).toBe(true);
    }
    const topics = new Map<string, Set<string>>();
    for (const entry of KB_ENTRIES) {
      const langs = topics.get(entry.topic) ?? new Set<string>();
      langs.add(entry.lang);
      topics.set(entry.topic, langs);
    }
    for (const topic of ["tm-what", "tm-nice", "tm-oa-what"]) {
      expect(topics.get(topic)?.has("en")).toBe(true);
    }
  });

  test("the curated corpus carries no PII pattern (M6.3)", () => {
    for (const entry of KB_ENTRIES) {
      expect(scanText(entry.title)).toBeNull();
      expect(scanText(entry.text)).toBeNull();
    }
  });

  test("resolveKbLocale maps common tags and defaults to English", () => {
    expect(resolveKbLocale("zh-CN")).toBe("zh-CN");
    expect(resolveKbLocale("zh-Hans")).toBe("zh-CN");
    expect(resolveKbLocale("zh-TW")).toBe("zh-TW");
    expect(resolveKbLocale("zh_Hant")).toBe("zh-TW");
    expect(resolveKbLocale("en-US")).toBe("en");
    expect(resolveKbLocale("fr")).toBe("en");
    expect(resolveKbLocale(undefined)).toBe("en");
  });
});
