import { normalizeMarkText } from "./normalize.js";

describe("normalizeMarkText", () => {
  test("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeMarkText("  Café   SOL ")).toBe("cafe sol");
  });

  test("drops punctuation to spaces (trigram-safe)", () => {
    expect(normalizeMarkText("ACME, Inc.")).toBe("acme inc");
  });

  test("strips combining marks via NFD", () => {
    expect(normalizeMarkText("Ünïcöde")).toBe("unicode");
  });

  test("is idempotent", () => {
    const once = normalizeMarkText("NiKE-Jordan 23!");
    expect(normalizeMarkText(once)).toBe(once);
  });
});
