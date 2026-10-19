import path from "node:path";
import { fileURLToPath } from "node:url";

import createNextIntlPlugin from "next-intl/plugin";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const standalone = process.env.NEXT_STANDALONE === "1";
const isProduction = process.env.NODE_ENV === "production";

/**
 * The API origin the client pages are allowed to call.
 *
 * `connect-src` has to name it explicitly: the assessment and assistant pages
 * fetch `/tm/assess` and `/tm/assistant` cross-origin, and a CSP that omits it
 * would block those two GATE surfaces at runtime rather than fail a build.
 */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
let apiOrigin = apiBaseUrl;
try {
  apiOrigin = new URL(apiBaseUrl).origin;
} catch {
  // A malformed value must not silently widen connect-src; fall back to same-origin.
  apiOrigin = "'self'";
}

/**
 * Content Security Policy (BUG-035, 01-system-design.md §11.3).
 *
 * `frame-ancestors 'none'` is expressed here rather than as a separate
 * X-Frame-Options header: CSP is the modern directive and it covers more cases
 * (it also blocks being framed by a same-origin route).
 *
 * `'unsafe-inline'` in script-src is a deliberate, documented trade-off. The
 * marketing pages are statically generated (SCHEDULE 1.5), and a per-request
 * nonce is impossible with SSG because the HTML is produced once at build time
 * and served from a CDN edge. Locking this down properly means moving to
 * middleware-injected nonces and giving up static generation — a change to make
 * at the M1 exit gate, not inside this phase. `'unsafe-eval'` is granted in
 * development only, because the dev bundler needs it and production never does.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  // Tailwind/Next emit inline style attributes and a <style> block per route.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

/**
 * Security headers applied to every response (BUG-035).
 *
 * HSTS is emitted in production only; sending it over plain HTTP during local
 * development can pin a developer's browser to https on a host that has no
 * certificate.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: isProduction ? "max-age=63072000; includeSubDomains; preload" : "max-age=0",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  ...(standalone ? { output: "standalone", outputFileTracingRoot: monorepoRoot } : {}),
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);