# Magic-link delivery runbook

- Delivery channel: AliCloud DirectMail (DQ-017, P2.5). Intl account, Singapore
  region (`dm.ap-southeast-1.aliyuncs.com`), sender domain mail.<domain>.
  **Staging links are deliverable once DirectMail secrets are provisioned.**
  - Provision `DIRECTMAIL_ACCESS_KEY_ID` / `DIRECTMAIL_ACCESS_KEY_SECRET`
    (intl RAM user with DirectMail send permission) and
    `DIRECTMAIL_ACCOUNT_NAME` (sender address on the verified mail.<domain>).
  - Production fails closed at boot without all three (magic links are the
    only client login path).
  - Staging may temporarily run without them only via the explicit opt-in
    `DIRECTMAIL_ALLOW_LOGGER_FALLBACK=true` — the metadata-only logger then
    logs subject + recipient domain, and staging links remain undeliverable.
    The flag is never honored in production and is ignored in dev/test (the
    logger is already the default there).
- Tokens: random 256-bit, single-use, 15-minute TTL; stored at rest as HMAC-SHA256
  hashes keyed by MAGIC_LINK_SECRET (never SESSION_SECRET — domain separation, R-023).
- Redemption: atomic single-use consume; 5 failed attempts destroy the token; rate
  limits 20/1h per IP and 5/1h per contact (neutral 202 for unknown addresses).
- Sessions: mkus_portal opaque cookie, 30-minute sliding TTL, HttpOnly + SameSite=Lax;
  revoked on Contact.deletedAt.
- Never log the token, the link URL, or the recipient address local part.
