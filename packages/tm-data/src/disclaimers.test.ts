import { disclaimerFor, disclaimersByLocale, DISCLAIMERS, DISCLAIMER_VERSION, SUPPORTED_LOCALES } from "./disclaimers.js";

describe("disclaimer registry (M6.2 / D-03)", () => {
  test("ships all three D-03 locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "zh-CN", "zh-TW"]);
    for (const locale of SUPPORTED_LOCALES) {
      expect(DISCLAIMERS[locale].locale).toBe(locale);
      expect(DISCLAIMERS[locale].points).toHaveLength(4);
      expect(DISCLAIMERS[locale].text.length).toBeGreaterThan(20);
      expect(DISCLAIMERS[locale].text).toBe(DISCLAIMERS[locale].points.join(" "));
    }
  });

  test("stamps the version on every locale", () => {
    expect(DISCLAIMER_VERSION.length).toBeGreaterThan(0);
    for (const locale of SUPPORTED_LOCALES) {
      expect(DISCLAIMERS[locale].version).toBe(DISCLAIMER_VERSION);
    }
  });

  test("disclaimersByLocale mirrors the registry text", () => {
    const byLocale = disclaimersByLocale();
    expect(Object.keys(byLocale).sort()).toEqual([...SUPPORTED_LOCALES].sort());
    expect(byLocale["zh-CN"]).toBe(DISCLAIMERS["zh-CN"].text);
  });

  test("falls back to English for an unknown locale", () => {
    expect(disclaimerFor("fr").locale).toBe("en");
    expect(disclaimerFor("zh-TW").locale).toBe("zh-TW");
  });
});
