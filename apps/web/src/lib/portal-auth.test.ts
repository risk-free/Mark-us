import {
  cookieValueFromSetCookie,
  hasTokenShape,
  verifyMagicLinkToken,
  type FetchLike,
} from "./portal-auth";

/**
 * P2.6 gate: magic-link token-verify flow — success, expired and tampered.
 * The API deliberately answers all bad tokens with 401, so the web side must
 * render the same neutral outcome for "expired" and "tampered" (they are one
 * bucket by design); only the transport-level cases diverge.
 */

const VALID_TOKEN = "a".repeat(43);

const okResponse = (setCookie: string | null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    contactId: "ctn_1",
    displayName: "Ada Lovelace",
    csrfToken: "csrf-secret-1",
    expiresAt: "2026-10-27T12:30:00.000Z",
  }),
  headers: new Headers(setCookie === null ? {} : { "set-cookie": setCookie }),
});

const errorResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({ status, code: "UNAUTHENTICATED" }),
  headers: new Headers(),
});

const fetchReturning = (response: unknown): FetchLike =>
  (jest.fn(async () => response) as unknown) as FetchLike;

describe("hasTokenShape", () => {
  test("accepts contract-shaped tokens and rejects short/long ones", () => {
    expect(hasTokenShape(VALID_TOKEN)).toBe(true);
    expect(hasTokenShape("a".repeat(20))).toBe(true);
    expect(hasTokenShape("a".repeat(19))).toBe(false);
    expect(hasTokenShape("a".repeat(513))).toBe(false);
    expect(hasTokenShape("")).toBe(false);
  });
});

describe("cookieValueFromSetCookie", () => {
  test("parses the session cookie value and ignores attributes", () => {
    expect(
      cookieValueFromSetCookie(
        "mkus_portal=sess_abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800",
        "mkus_portal",
      ),
    ).toBe("sess_abc123");
  });

  test("returns null when the cookie is absent or the header is null", () => {
    expect(cookieValueFromSetCookie("other=1; Path=/", "mkus_portal")).toBeNull();
    expect(cookieValueFromSetCookie(null, "mkus_portal")).toBeNull();
  });
});

describe("verifyMagicLinkToken", () => {
  test("success: returns the session payload and the portal cookie value", async () => {
    const fetchImpl = fetchReturning(
      okResponse("mkus_portal=sess_ok; Path=/; HttpOnly; SameSite=Lax"),
    );
    const outcome = await verifyMagicLinkToken(fetchImpl, "http://api.test", VALID_TOKEN);
    expect(outcome).toEqual({
      kind: "ok",
      result: {
        contactId: "ctn_1",
        displayName: "Ada Lovelace",
        csrfToken: "csrf-secret-1",
        expiresAt: "2026-10-27T12:30:00.000Z",
      },
      sessionCookie: "sess_ok",
    });
  });

  test("expired token: API 401 maps to the neutral invalid outcome", async () => {
    const outcome = await verifyMagicLinkToken(
      fetchReturning(errorResponse(401)),
      "http://api.test",
      VALID_TOKEN,
    );
    expect(outcome).toEqual({ kind: "invalid" });
  });

  test("tampered token: API 401 maps to the same neutral invalid outcome", async () => {
    const outcome = await verifyMagicLinkToken(
      fetchReturning(errorResponse(401)),
      "http://api.test",
      `${VALID_TOKEN}x`.slice(0, 43),
    );
    expect(outcome).toEqual({ kind: "invalid" });
  });

  test("malformed token never reaches the network", async () => {
    const fetchImpl = fetchReturning(okResponse(null));
    const outcome = await verifyMagicLinkToken(fetchImpl, "http://api.test", "short");
    expect(outcome).toEqual({ kind: "invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("5xx and transport failure map to unavailable, not invalid", async () => {
    await expect(
      verifyMagicLinkToken(fetchReturning(errorResponse(500)), "http://api.test", VALID_TOKEN),
    ).resolves.toEqual({ kind: "unavailable" });

    const throwing = (jest.fn(async () => {
      throw new Error("connection refused");
    }) as unknown) as FetchLike;
    await expect(
      verifyMagicLinkToken(throwing, "http://api.test", VALID_TOKEN),
    ).resolves.toEqual({ kind: "unavailable" });
  });

  test("a 200 without the session cookie cannot establish a session", async () => {
    const outcome = await verifyMagicLinkToken(
      fetchReturning(okResponse(null)),
      "http://api.test",
      VALID_TOKEN,
    );
    expect(outcome).toEqual({ kind: "unavailable" });
  });
});
