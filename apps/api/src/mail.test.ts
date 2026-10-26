/**
 * DirectMail adapter tests (P2.5, DQ-017). All HTTP is mocked — no real
 * DirectMail calls. Signing is verified against an independent HMAC-SHA1
 * recomputation from the captured request parameters.
 */

import { createHmac } from "node:crypto";

import {
  DirectMailError,
  DirectMailSender,
  LoggingMailSender,
  MagicLinkEmailDeliverer,
  mailSenderFromEnv,
  type DirectMailConfig,
  type MailSender,
} from "./mail.js";

const CONFIG: DirectMailConfig = {
  accessKeyId: "test-access-key-id",
  accessKeySecret: "test-access-key-secret",
  accountName: "no-reply@mail.markus.hk",
  region: "ap-southeast-1",
};

const NOW = new Date("2026-10-26T14:03:09.000Z");
const NONCE = "test-nonce-0001";

interface CapturedRequest {
  url: string;
  params: URLSearchParams;
}

const captureFetch = (
  responder: (params: URLSearchParams) => { status: number; body: unknown },
): { fetch: typeof fetch; calls: CapturedRequest[] } => {
  const calls: CapturedRequest[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body ?? ""));
    calls.push({ url: String(input), params });
    const { status, body } = responder(params);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetch: fn, calls };
};

const okFetch = () => captureFetch(() => ({ status: 200, body: { RequestId: "req-1" } }));

const sender = (fetch: typeof fetch): DirectMailSender =>
  new DirectMailSender(CONFIG, { fetch, now: () => NOW, nonce: () => NONCE });

const MESSAGE = {
  to: "client@example.cn",
  subject: "Mark-us 登录链接 / Your Mark-us sign-in link",
  text: "Use this link: https://portal.test/portal/auth?token=abc",
  tag: "magic-link",
};

/** Independent recomputation of the Aliyun RPC signature from captured params. */
const expectedSignature = (params: URLSearchParams): string => {
  const pairs: [string, string][] = [];
  params.forEach((value, key) => {
    if (key !== "Signature") pairs.push([key, value]);
  });
  const encode = (value: string): string =>
    encodeURIComponent(value)
      .replace(/\+/g, "%20")
      .replace(/\*/g, "%2A")
      .replace(/%7E/g, "~");
  const canonical = pairs
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join("&");
  const stringToSign = `POST&${encode("/")}&${encode(canonical)}`;
  return createHmac("sha1", `${CONFIG.accessKeySecret}&`).update(stringToSign).digest("base64");
};

describe("DirectMailSender", () => {
  test("posts a signed SingleSendMail form to the regional endpoint", async () => {
    const { fetch, calls } = okFetch();
    await sender(fetch).send(MESSAGE);

    expect(calls).toHaveLength(1);
    const { url, params } = calls[0]!;
    expect(url).toBe("https://dm.ap-southeast-1.aliyuncs.com/");
    expect(params.get("Action")).toBe("SingleSendMail");
    expect(params.get("Version")).toBe("2015-11-23");
    expect(params.get("Format")).toBe("JSON");
    expect(params.get("RegionId")).toBe("ap-southeast-1");
    expect(params.get("SignatureMethod")).toBe("HMAC-SHA1");
    expect(params.get("SignatureVersion")).toBe("1.0");
    expect(params.get("SignatureNonce")).toBe(NONCE);
    // ISO-8601 UTC, seconds precision (DirectMail rejects milliseconds).
    expect(params.get("Timestamp")).toBe("2026-10-26T14:03:09Z");
    expect(params.get("AccessKeyId")).toBe(CONFIG.accessKeyId);
    // The secret key material never leaves the process.
    expect(params.get("AccessKeySecret")).toBeNull();
    expect(params.toString()).not.toContain(CONFIG.accessKeySecret);
  });

  test("carries the SingleSendMail business payload", async () => {
    const { fetch, calls } = okFetch();
    await sender(fetch).send(MESSAGE);
    const { params } = calls[0]!;
    expect(params.get("AccountName")).toBe(CONFIG.accountName);
    expect(params.get("AddressType")).toBe("1");
    expect(params.get("ReplyToAddress")).toBe("false");
    expect(params.get("ToAddress")).toBe(MESSAGE.to);
    expect(params.get("Subject")).toBe(MESSAGE.subject);
    expect(params.get("TextBody")).toBe(MESSAGE.text);
    expect(params.get("TagName")).toBe("magic-link");
    expect(params.get("HtmlBody")).toBeNull();
  });

  test("signature matches an independent HMAC-SHA1 recomputation", async () => {
    const { fetch, calls } = okFetch();
    await sender(fetch).send(MESSAGE);
    const { params } = calls[0]!;
    const signature = params.get("Signature");
    expect(signature).not.toBeNull();
    expect(signature).toBe(expectedSignature(params));
    // Fixed nonce + clock → deterministic signature.
    expect(signature).toBe(sender(fetch).buildSignedParams(MESSAGE).Signature);
  });

  test("omits optional params (HtmlBody/TagName/FromAlias) when unset", async () => {
    const { fetch, calls } = okFetch();
    await sender(fetch).send({ to: MESSAGE.to, subject: "s", text: "t" });
    const { params } = calls[0]!;
    expect(params.get("HtmlBody")).toBeNull();
    expect(params.get("TagName")).toBeNull();
    expect(params.get("FromAlias")).toBeNull();
  });

  test("throws DirectMailError with the provider code on rejection, without echoing secrets", async () => {
    const { fetch } = captureFetch(() => ({
      status: 400,
      body: { RequestId: "req-2", Code: "InvalidMailAddress.NotFound", Message: `bad sender for ${CONFIG.accessKeySecret}` },
    }));
    const error = await sender(fetch)
      .send(MESSAGE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DirectMailError);
    expect((error as DirectMailError).code).toBe("InvalidMailAddress.NotFound");
    expect((error as DirectMailError).message).not.toContain(CONFIG.accessKeySecret);
  });

  test("wraps transport failures in DirectMailError", async () => {
    const failing = (async () => {
      throw new Error("socket hang up");
    }) as typeof fetch;
    await expect(sender(failing).send(MESSAGE)).rejects.toBeInstanceOf(DirectMailError);
  });

  test("treats a 2xx with an error Code as failure", async () => {
    const { fetch } = captureFetch(() => ({
      status: 200,
      body: { RequestId: "req-3", Code: "Throttling", Message: "rate limited" },
    }));
    await expect(sender(fetch).send(MESSAGE)).rejects.toMatchObject({ code: "Throttling" });
  });
});

describe("LoggingMailSender (dev/test default)", () => {
  test("logs metadata only — never the body, link or address local part", async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await new LoggingMailSender().send(MESSAGE);
    } finally {
      spy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("example.cn");
    expect(lines[0]).not.toContain("client@");
    expect(lines[0]).not.toContain("token=abc");
    expect(lines[0]).not.toContain(MESSAGE.text);
  });
});

describe("MagicLinkEmailDeliverer (deliverer port contract)", () => {
  class RecordingSender implements MailSender {
    readonly sent: { to: string; subject: string; text: string; tag?: string }[] = [];
    async send(message: { to: string; subject: string; text: string; html?: string; tag?: string }): Promise<void> {
      this.sent.push(message);
    }
  }

  test("sends the magic-link URL to the contact email", async () => {
    const mail = new RecordingSender();
    const deliverer = new MagicLinkEmailDeliverer({ mail });
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await deliverer.deliver({
      contactId: "contact-1",
      email: "client@example.cn",
      url: "https://portal.test/portal/auth?token=xyz",
      expiresAt,
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.to).toBe("client@example.cn");
    expect(mail.sent[0]!.text).toContain("https://portal.test/portal/auth?token=xyz");
    expect(mail.sent[0]!.tag).toBe("magic-link");
  });

  test("propagates send failure so the service keeps the neutral 202", async () => {
    const failing: MailSender = {
      async send() {
        throw new DirectMailError("boom", "Throttling");
      },
    };
    const deliverer = new MagicLinkEmailDeliverer({ mail: failing });
    await expect(
      deliverer.deliver({
        contactId: "contact-1",
        email: "client@example.cn",
        url: "https://portal.test/portal/auth?token=xyz",
        expiresAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(DirectMailError);
  });
});

describe("mailSenderFromEnv", () => {
  const base = {
    NODE_ENV: "development" as const,
    PORT: 3001,
    RUN_WORKER: false,
    DIRECTMAIL_REGION: "ap-southeast-1",
    DIRECTMAIL_ALLOW_LOGGER_FALLBACK: false,
  };

  test("selects DirectMail when fully configured", () => {
    const sender = mailSenderFromEnv({
      ...base,
      DIRECTMAIL_ACCESS_KEY_ID: "id",
      DIRECTMAIL_ACCESS_KEY_SECRET: "secret",
      DIRECTMAIL_ACCOUNT_NAME: "no-reply@mail.markus.hk",
    } as Parameters<typeof mailSenderFromEnv>[0]);
    expect(sender).toBeInstanceOf(DirectMailSender);
  });

  test("falls back to the metadata-only logger when unconfigured", () => {
    const sender = mailSenderFromEnv(base as Parameters<typeof mailSenderFromEnv>[0]);
    expect(sender).toBeInstanceOf(LoggingMailSender);
  });

  test("partial config falls back to the logger (the env gate owns enforcement)", () => {
    const sender = mailSenderFromEnv({
      ...base,
      DIRECTMAIL_ACCESS_KEY_ID: "id",
    } as Parameters<typeof mailSenderFromEnv>[0]);
    expect(sender).toBeInstanceOf(LoggingMailSender);
  });
});
