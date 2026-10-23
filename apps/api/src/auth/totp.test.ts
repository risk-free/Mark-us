import { base32Decode, hotp, totp, verifyTotp } from "./totp.js";

// RFC 6238 Appendix B SHA-1 test vectors (secret = ASCII "12345678901234567890").
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RFC_VECTORS: { atMs: number; code8: string }[] = [
  { atMs: 59_000, code8: "94287082" },
  { atMs: 1_111_111_109_000, code8: "07081804" },
  { atMs: 1_111_111_111_000, code8: "14050471" },
  { atMs: 1_234_567_890_000, code8: "89005924" },
  { atMs: 2_000_000_000_000, code8: "69279037" },
  { atMs: 20_000_000_000_000, code8: "65353130" },
];

describe("base32Decode", () => {
  test("round-trips the RFC 6238 secret and tolerates padding/case", () => {
    const expected = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(RFC_SECRET_BASE32)).toEqual(expected);
    expect(base32Decode(`${RFC_SECRET_BASE32.toLowerCase()}==`)).toEqual(expected);
  });

  test("rejects characters outside the alphabet", () => {
    expect(() => base32Decode("GEZDGNBV!")).toThrow(/invalid base32/);
  });
});

describe("totp", () => {
  test.each(RFC_VECTORS)("matches RFC 6238 SHA-1 vector at $atMs", ({ atMs, code8 }) => {
    const secret = base32Decode(RFC_SECRET_BASE32);
    expect(totp(secret, atMs, 30, 8)).toBe(code8);
    expect(hotp(secret, Math.floor(atMs / 1000 / 30), 8)).toBe(code8);
  });
});

describe("verifyTotp", () => {
  const secret = base32Decode(RFC_SECRET_BASE32);
  const atMs = 1_700_000_000_000;

  test("accepts the current step and one step of clock drift", () => {
    for (const drift of [-1, 0, 1]) {
      const code = totp(secret, atMs + drift * 30_000);
      expect(verifyTotp(secret, code, atMs)).toBe(true);
    }
  });

  test("rejects a code two steps away and a wrong code", () => {
    expect(verifyTotp(secret, totp(secret, atMs + 2 * 30_000), atMs)).toBe(false);
    expect(verifyTotp(secret, "000000", atMs)).toBe(false);
  });

  test("rejects non-numeric input without throwing", () => {
    expect(verifyTotp(secret, "abcdef", atMs)).toBe(false);
  });
});
