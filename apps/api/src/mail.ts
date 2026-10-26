/**
 * AliCloud DirectMail adapter (DQ-017/R, P2.5). Intl account, Singapore
 * region by default (`dm.ap-southeast-1.aliyuncs.com`), sender domain
 * mail.<domain>. Email is mandatory: magic links are the only client login
 * path, so production refuses to boot without DirectMail config (fail closed
 * in packages/config); dev/test default to the metadata-only logger.
 *
 * Signing: classic Aliyun RPC HMAC-SHA1 over `SingleSendMail` (API version
 * 2015-11-23). The AccessKeySecret is only ever an HMAC key — it never
 * appears in requests, logs or error messages.
 */

import { createHmac, randomUUID } from "node:crypto";

import type { Env } from "@markus/config";

import type { MagicLinkDeliverer } from "./auth/magic-link.js";

export interface MailMessage {
  /** Recipient address. PII — never logged. */
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** DirectMail tag for delivery analytics (e.g. "magic-link"). */
  tag?: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export interface DirectMailConfig {
  accessKeyId: string;
  accessKeySecret: string;
  /** Sender address on the verified mail.<domain> domain (AliCloud AccountName). */
  accountName: string;
  /** AliCloud region id; endpoint resolves to https://dm.<region>.aliyuncs.com. */
  region: string;
  /** Optional display name (AliCloud FromAlias). */
  fromAlias?: string;
}

export interface DirectMailDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  nonce?: () => string;
}

/** Delivery failure. Carries the AliCloud error code, never request material. */
export class DirectMailError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = "DirectMailError";
    this.code = code;
  }
}

const API_VERSION = "2015-11-23";
const API_ACTION = "SingleSendMail";

/** RFC 3986 percent-encoding as required by the Aliyun RPC signature. */
const percentEncode = (value: string): string =>
  encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");

/** `yyyy-MM-ddTHH:mm:ssZ` in UTC — milliseconds rejected by DirectMail. */
const timestampOf = (now: Date): string => now.toISOString().replace(/\.\d{3}Z$/, "Z");

export class DirectMailSender implements MailSender {
  readonly #config: DirectMailConfig;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #nonce: () => string;

  constructor(config: DirectMailConfig, deps: DirectMailDeps = {}) {
    this.#config = config;
    this.#fetch = deps.fetch ?? globalThis.fetch;
    this.#now = deps.now ?? (() => new Date());
    this.#nonce = deps.nonce ?? (() => randomUUID());
  }

  /** Signed request parameters — separated from transport so tests see the exact payload. */
  buildSignedParams(message: MailMessage): Record<string, string> {
    const params: Record<string, string> = {
      AccessKeyId: this.#config.accessKeyId,
      Action: API_ACTION,
      Format: "JSON",
      RegionId: this.#config.region,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: this.#nonce(),
      SignatureVersion: "1.0",
      Timestamp: timestampOf(this.#now()),
      Version: API_VERSION,
      AccountName: this.#config.accountName,
      AddressType: "1",
      ReplyToAddress: "false",
      ToAddress: message.to,
      Subject: message.subject,
      TextBody: message.text,
    };
    if (message.html !== undefined) params.HtmlBody = message.html;
    if (message.tag !== undefined) params.TagName = message.tag;
    if (this.#config.fromAlias !== undefined) params.FromAlias = this.#config.fromAlias;
    params.Signature = this.#signature(params);
    return params;
  }

  /** Base64(HMAC-SHA1(stringToSign, secret + "&")) over the sorted query string. */
  #signature(params: Record<string, string>): string {
    const canonical = Object.keys(params)
      .sort()
      .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
      .join("&");
    const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonical)}`;
    return createHmac("sha1", `${this.#config.accessKeySecret}&`).update(stringToSign).digest("base64");
  }

  endpoint(): string {
    return `https://dm.${this.#config.region}.aliyuncs.com/`;
  }

  async send(message: MailMessage): Promise<void> {
    const body = new URLSearchParams(this.buildSignedParams(message)).toString();
    let response: Response;
    try {
      response = await this.#fetch(this.endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error) {
      throw new DirectMailError("DirectMail request failed", null, { cause: error });
    }

    let payload: { Code?: unknown; Message?: unknown } | null = null;
    try {
      payload = (await response.json()) as { Code?: unknown; Message?: unknown };
    } catch {
      payload = null;
    }
    const code = typeof payload?.Code === "string" ? payload.Code : null;
    if (!response.ok || code !== null) {
      // `Message` can echo request parameters — report the code only.
      throw new DirectMailError(`DirectMail rejected the send (status ${response.status})`, code);
    }
  }
}

/**
 * Dev/test default: metadata only. The recipient local part, body and any
 * link URL are never logged (PII + R-005); the domain alone is kept so a
 * developer can confirm the intended channel.
 */
export class LoggingMailSender implements MailSender {
  async send(message: MailMessage): Promise<void> {
    const domain = message.to.split("@")[1] ?? "(invalid)";
    console.log(
      `[mail] (metadata-only) to=*@${domain} subject=${JSON.stringify(message.subject)} tag=${message.tag ?? "-"}`,
    );
  }
}

/** Magic-link delivery over the configured mail sender (P2.5, DQ-017). */
export class MagicLinkEmailDeliverer implements MagicLinkDeliverer {
  readonly #mail: MailSender;

  constructor(deps: { mail: MailSender }) {
    this.#mail = deps.mail;
  }

  async deliver(input: { contactId: string; email: string; url: string; expiresAt: Date }): Promise<void> {
    const minutes = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 60_000));
    await this.#mail.send({
      to: input.email,
      subject: "Mark-us 登录链接 / Your Mark-us sign-in link",
      text: [
        `点击以下链接登录 Mark-us 客户门户（${minutes} 分钟内有效，一次性使用）：`,
        input.url,
        "",
        `Use the link below to sign in to the Mark-us client portal (valid for ${minutes} minutes, single use):`,
        input.url,
        "",
        "如果您没有请求此链接，请忽略本邮件。 / If you did not request this link, ignore this email.",
      ].join("\n"),
      tag: "magic-link",
    });
  }
}

/**
 * Sender selection (P2.5): DirectMail when configured; otherwise the
 * metadata-only logger. Production/staging enforcement lives in
 * `assertProductionSafety` (fail closed) — this factory trusts the gate.
 */
export function mailSenderFromEnv(env: Env, deps: DirectMailDeps = {}): MailSender {
  if (env.DIRECTMAIL_ACCESS_KEY_ID && env.DIRECTMAIL_ACCESS_KEY_SECRET && env.DIRECTMAIL_ACCOUNT_NAME) {
    return new DirectMailSender(
      {
        accessKeyId: env.DIRECTMAIL_ACCESS_KEY_ID,
        accessKeySecret: env.DIRECTMAIL_ACCESS_KEY_SECRET,
        accountName: env.DIRECTMAIL_ACCOUNT_NAME,
        region: env.DIRECTMAIL_REGION,
      },
      deps,
    );
  }
  return new LoggingMailSender();
}
