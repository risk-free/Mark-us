import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localeForCountry,
  localeFromAcceptLanguage,
} from "./locales";

describe("D-03: UI locales equal the disclaimer locales", () => {
  it("is the same set as @markus/tm-data SUPPORTED_LOCALES", async () => {
    // Imported dynamically because the workspace package compiles to ESM.
    const { SUPPORTED_LOCALES } = await import("@markus/tm-data");

    expect([...LOCALES].sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it("defaults to zh-CN (D-11)", () => {
    expect(DEFAULT_LOCALE).toBe("zh-CN");
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("isLocale", () => {
  it.each(LOCALES)("accepts %s", (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it.each(["en-US", "zh-HK", "fr", "", "EN", undefined, null, 42])(
    "rejects %s",
    (value) => {
      expect(isLocale(value)).toBe(false);
    },
  );
});

describe("localeForCountry (IP detection, D-11)", () => {
  it("maps Greater China by script, not by shorthand", () => {
    expect(localeForCountry("HK")).toBe("zh-TW");
    expect(localeForCountry("MO")).toBe("zh-TW");
    expect(localeForCountry("TW")).toBe("zh-TW");
    expect(localeForCountry("CN")).toBe("zh-CN");
    expect(localeForCountry("SG")).toBe("zh-CN");
  });

  it("maps English-speaking markets", () => {
    expect(localeForCountry("US")).toBe("en");
    expect(localeForCountry("GB")).toBe("en");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(localeForCountry(" hk ")).toBe("zh-TW");
    expect(localeForCountry("cn")).toBe("zh-CN");
  });

  it("returns null rather than guessing for an unmapped country", () => {
    // Guessing would serve a visitor a locale they did not ask for.
    expect(localeForCountry("BR")).toBeNull();
    expect(localeForCountry("")).toBeNull();
    expect(localeForCountry("XYZ")).toBeNull();
  });
});

describe("localeFromAcceptLanguage", () => {
  it("resolves the same tags as resolveKbLocale in packages/kb", () => {
    expect(localeFromAcceptLanguage("zh-CN")).toBe("zh-CN");
    expect(localeFromAcceptLanguage("zh-Hans")).toBe("zh-CN");
    expect(localeFromAcceptLanguage("zh-TW")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("zh-Hant")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("zh-HK")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("zh_Hant")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("en-US")).toBe("en");
  });

  it("honours q-values", () => {
    expect(localeFromAcceptLanguage("en;q=0.9,zh-TW;q=1.0")).toBe("zh-TW");
    expect(localeFromAcceptLanguage("zh-TW;q=0.2,en;q=0.8")).toBe("en");
  });

  it("ignores q=0 entries", () => {
    expect(localeFromAcceptLanguage("en;q=0,zh-CN")).toBe("zh-CN");
  });

  it("returns null when nothing is supported or the header is absent", () => {
    expect(localeFromAcceptLanguage("fr-FR,de")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage(undefined)).toBeNull();
    expect(localeFromAcceptLanguage("")).toBeNull();
  });
});