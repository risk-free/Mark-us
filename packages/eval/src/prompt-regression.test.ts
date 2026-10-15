import {
  buildRagMessages,
  buildSystemPrompt,
  buildUserPrompt,
  resolveKbLocale,
  type PromptContext,
} from "@markus/kb";

import { CLEAN_CONTEXT, PROMPT_MATRIX } from "./datasets.js";

const NOT_LEGAL_ADVICE: Record<"en" | "zh-CN" | "zh-TW", string> = {
  en: "not legal advice",
  "zh-CN": "\u4e0d\u6784\u6210\u6cd5\u5f8b\u610f\u89c1",
  "zh-TW": "\u4e0d\u69cb\u6210\u6cd5\u5f8b\u610f\u898b",
};

describe("prompt regression", () => {
  test.each(["en", "zh-CN", "zh-TW"] as const)("snapshots the %s prompt", (locale) => {
    const context: PromptContext = { ...CLEAN_CONTEXT, locale };
    expect(buildRagMessages(context)).toMatchSnapshot();
  });

  test("an unknown locale falls back to the English system prompt", () => {
    expect(buildSystemPrompt("de")).toBe(buildSystemPrompt("en"));
    const unknown: PromptContext = { ...CLEAN_CONTEXT, locale: resolveKbLocale("de") };
    expect(unknown.locale).toBe("en");
    expect(buildRagMessages(unknown)).toMatchSnapshot();
  });

  test.each(["en", "zh-CN", "zh-TW"] as const)(
    "the %s system prompt states not-legal-advice and how to cite",
    (locale) => {
      const system = buildSystemPrompt(locale);
      expect(system).toContain(NOT_LEGAL_ADVICE[locale]);
      expect(system).toContain("[1]");
    },
  );

  test("the user prompt fences untrusted data", () => {
    const user = buildUserPrompt(CLEAN_CONTEXT);
    expect(user.startsWith("<<<DATA>>>")).toBe(true);
    expect(user).toContain("<<<END DATA>>>");
  });

  test("the prompt matrix covers all three locales", () => {
    expect(PROMPT_MATRIX.map((context) => context.locale)).toEqual(["en", "zh-CN", "zh-TW"]);
  });
});
