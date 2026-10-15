import { scanText } from "@markus/llm-gateway";

import {
  buildRagMessages,
  buildSystemPrompt,
  buildUserPrompt,
  RAG_PROMPT_VERSION,
  type PromptSource,
} from "./prompts.js";

const SOURCES: PromptSource[] = [
  {
    index: 1,
    title: "What a trademark protects",
    url: "https://www.uspto.gov/trademarks/basics",
    text: "A trademark identifies the source of goods or services.",
  },
  {
    index: 2,
    title: "Nice classification overview",
    url: "https://www.uspto.gov/trademarks/classification",
    text: "Goods fall into classes one to thirty-four and services into thirty-five to forty-five.",
  },
];

describe("buildSystemPrompt", () => {
  const ATTORNEY: Record<"en" | "zh-CN" | "zh-TW", string> = {
    en: "attorney",
    "zh-CN": "律师",
    "zh-TW": "律師",
  };

  test.each(["en", "zh-CN", "zh-TW"] as const)("%s states not-legal-advice and cite-the-KB rules", (locale) => {
    const prompt = buildSystemPrompt(locale);
    expect(prompt).toContain("[1]");
    expect(prompt).toContain(ATTORNEY[locale]);
    expect(prompt).toContain("MarkUs");
  });

  test("uses English for an unknown locale", () => {
    expect(buildSystemPrompt("de")).toBe(buildSystemPrompt("en"));
  });

  test("instructs the model to say when information is insufficient", () => {
    expect(buildSystemPrompt("en")).toMatch(/do not contain enough information/i);
    expect(buildSystemPrompt("zh-CN")).toContain("信息不足");
    expect(buildSystemPrompt("zh-TW")).toContain("資訊不足");
  });
});

describe("RAG_PROMPT_VERSION", () => {
  test("is a semver-shaped version naming the RAG prompt contract", () => {
    expect(RAG_PROMPT_VERSION).toMatch(/^rag-\d+\.\d+\.\d+$/);
  });
});

describe("buildUserPrompt", () => {
  test("includes only the permitted fields and cites each source by index, title and url", () => {
    const prompt = buildUserPrompt({
      markText: "ACME",
      classCodes: [25, 35],
      jurisdiction: "US",
      businessDescription: "athletic apparel and retail services",
      sources: SOURCES,
      locale: "en",
    });

    expect(prompt).toContain("ACME");
    expect(prompt).toContain("25, 35");
    expect(prompt).toContain("US");
    expect(prompt).toContain("athletic apparel and retail services");
    expect(prompt).toContain("[1] What a trademark protects — https://www.uspto.gov/trademarks/basics");
    expect(prompt).toContain("[2] Nice classification overview — https://www.uspto.gov/trademarks/classification");
    expect(prompt).toContain("A trademark identifies the source");
  });

  test("notes when no KB excerpt was retrieved", () => {
    const prompt = buildUserPrompt({
      markText: "ACME",
      sources: [],
      locale: "en",
    });
    expect(prompt).toContain("(none retrieved)");
  });

  test("omits optional fields that were not provided", () => {
    const prompt = buildUserPrompt({ markText: "ACME", sources: SOURCES, locale: "en" });
    expect(prompt).not.toContain("Nice class(es)");
    expect(prompt).not.toContain("Jurisdiction");
    expect(prompt).not.toContain("Business description");
  });

  test("ships a PII-free prompt for clean inputs (M6.3)", () => {
    const messages = buildRagMessages({
      markText: "ACME",
      classCodes: [9],
      jurisdiction: "US",
      businessDescription: "software development",
      sources: SOURCES,
      locale: "en",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    for (const message of messages) {
      expect(scanText(message.content)).toBeNull();
    }
  });

  test("the shape accepts no contact fields, so a builder cannot include them", () => {
    const prompt = buildUserPrompt({
      markText: "ACME",
      classCodes: [25],
      jurisdiction: "US",
      businessDescription: "apparel",
      sources: SOURCES,
      locale: "en",
    });
    expect(prompt).not.toMatch(/contactName|wechatId|openId/);
  });
});
