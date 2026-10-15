import { assertNoPii, PII_DENYLIST, scanText } from "./pii.js";
import { LlmPiiError } from "./types.js";

describe("scanText", () => {
  test("passes clean mark/business text", () => {
    expect(scanText("ACME SOL, Nice class 25, jurisdiction US")).toBeNull();
  });

  test("detects e-mail, phone and contactId patterns", () => {
    expect(scanText("write to jane.doe@example.com")?.kind).toBe("email");
    expect(scanText("reach me on +86 138-0013-8000")?.kind).toBe("phone");
    expect(scanText("contactId: 12345")?.kind).toBe("contactId");
    expect(scanText("owner ckq1234567890abcdefghijklm")?.kind).toBe("contactId");
  });

  test("does not flag short numeric strings that are not phone numbers", () => {
    expect(scanText("class 25 filed in 2024")).toBeNull();
  });
});

describe("assertNoPii", () => {
  test("accepts messages without PII", () => {
    expect(() => assertNoPii([{ role: "user", content: "ACME class 25" }])).not.toThrow();
  });

  test("throws LlmPiiError with the pattern kind for a message body", () => {
    try {
      assertNoPii([{ role: "user", content: "email jane@example.com" }]);
      throw new Error("expected a PII rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmPiiError);
      expect((error as LlmPiiError).field).toBe("email");
      expect(String(error)).not.toContain("jane@example.com");
    }
  });

  test("rejects every denylisted key regardless of casing or separators", () => {
    for (const key of PII_DENYLIST) {
      const spaced = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
      expect(() => assertNoPii([], { [spaced]: "value" })).toThrow(LlmPiiError);
    }
  });

  test("recurses through objects and arrays", () => {
    expect(() => assertNoPii([], { business: { owners: [{ phone: "123" }] } })).toThrow(
      LlmPiiError,
    );
  });
});
