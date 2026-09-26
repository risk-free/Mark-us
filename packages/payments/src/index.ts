/**
 * Payments facade (D-05):
 *  Phase 1 — Stripe HK: cards, Apple/Google Pay, mainland Alipay, mainland WeChat Pay
 *  Phase 1b — PayPal
 *  Deferred — UnionPay; AlipayHK / WeChat Pay HK (via Alipay+ later if HK sellers appear)
 *  PayMe/FPS — deliberately dropped (no mainland coverage, low HK usage)
 * Invoices are always itemized (SERVICE_FEE | USPTO_FEE | OTHER line items).
 * Implementation lands in P4 (payments & invoicing wave).
 */

export type Provider = "STRIPE" | "PAYPAL";
export type Method =
  | "CARD"
  | "APPLE_PAY"
  | "GOOGLE_PAY"
  | "ALIPAY"
  | "WECHAT_PAY"
  | "PAYPAL";

export interface Money {
  amount: number; // major units
  currency: "USD" | "HKD";
}

export interface ChargeRequest {
  orderId: string;
  contactId: string;
  amount: Money;
  method: Method;
  returnUrl?: string;
}

export interface ChargeResult {
  provider: Provider;
  transactionId: string;
  clientSecret?: string;
  status: "REQUIRES_ACTION" | "SUCCEEDED" | "FAILED";
}

export async function createCharge(req: ChargeRequest): Promise<ChargeResult> {
  void req;
  throw new Error("@markus/payments: createCharge not implemented (scaffold P0; lands in P4)");
}

/** Webhook idempotency: returns the event id to dedupe on, or null if invalid. */
export async function verifyWebhook(
  provider: Provider,
  headers: Record<string, string>,
  rawBody: string,
): Promise<{ eventId: string; type: string; payload: unknown } | null> {
  void provider;
  void headers;
  void rawBody;
  throw new Error("@markus/payments: verifyWebhook not implemented (scaffold P0; lands in P4)");
}
