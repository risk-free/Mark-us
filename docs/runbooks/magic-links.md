# Magic-link delivery runbook

- Delivery channel: none in staging yet. The magic-link deliverer is metadata-only
  (logs contactId + expiresAt; never the token or the link URL) until the DirectMail
  adapter lands in P2.5 (DQ-017). **Staging links are undeliverable until P2.5.** No
  real clients exist before M2, so there is no exposure.
- Tokens: random 256-bit, single-use, 15-minute TTL; stored at rest as HMAC-SHA256
  hashes keyed by MAGIC_LINK_SECRET (never SESSION_SECRET — domain separation, R-023).
- Redemption: atomic single-use consume; 5 failed attempts destroy the token; rate
  limits 20/1h per IP and 5/1h per contact (neutral 202 for unknown addresses).
- Sessions: mkus_portal opaque cookie, 30-minute sliding TTL, HttpOnly + SameSite=Lax;
  revoked on Contact.deletedAt.
