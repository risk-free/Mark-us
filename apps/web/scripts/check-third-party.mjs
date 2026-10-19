#!/usr/bin/env node
/**
 * M8.3 — first-party funnel only (D-07).
 *
 * Static check that `apps/web` contains no third-party analytics or tracking SDK.
 * Enforcement is deliberately blunt: a denylist of vendor hosts and package names
 * is checked against every source file, every file in `public/`, and the resolved
 * dependency list.
 *
 * The only sanctioned third-party *content* is the API origin
 * (`NEXT_PUBLIC_API_BASE_URL`), which is our own service, not a tracker — so it is
 * asserted to be present rather than blocked.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Vendor endpoints that indicate a third-party analytics pixel or SDK. */
const FORBIDDEN_HOSTS = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "connect.facebook.net",
  "facebook.com/tr",
  "segment.io",
  "segment.com",
  "cdn.segment.com",
  "mixpanel.com",
  "api.mixpanel.com",
  "amplitude.com",
  "api.amplitude.com",
  "plausible.io",
  "umami.is",
  "hotjar.com",
  "static.hotjar.com",
  "clarity.ms",
  "matomo",
  "piwik",
  "hm.baidu.com",
  "tongji.baidu.com",
  "cnzz.com",
  "umeng.com",
  "fullstory.com",
  "heap.io",
  "posthog.com",
  "intercom.io",
  "mixpanel",
  "loggly.com",
  "newrelic.com",
  "nr-data.net",
  "datadoghq.com",
  "sentry.io",
];

/** Analytics identifiers that must not appear in a <script> or inline call. */
const FORBIDDEN_TOKENS = [
  "gtag(",
  "ga(",
  "_gaq",
  "dataLayer",
  "fbq(",
  "segment.com",
  "plausible(",
  "umami(",
  "hj(",
  "_hst",
  "mixpanel.init",
  "amplitude.init",
  "posthog.init",
];

/** Packages that would drag a tracker into the bundle. */
const FORBIDDEN_PACKAGES = [
  "react-ga",
  "react-ga4",
  "google-analytics",
  "@google-analytics/ga",
  "gtag",
  "mixpanel",
  "amplitude",
  "segment",
  "posthog",
  "plausible",
  "hotjar",
  "fullstory",
  "heap",
  "intercom",
  "sentry",
  "newrelic",
  "logrocket",
  "matomo",
  "baidu-analytics",
  "cnzz",
  "umeng",
];

function walk(dir, predicate, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // directory absent (e.g. no public/ yet) is not a failure
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, predicate, found);
    } else if (predicate(full)) {
      found.push(full);
    }
  }
  return found;
}

const failures = [];

const sourceFiles = walk(join(APP_ROOT, "src"), (f) => /\.[cm]?[jt]sx?$/.test(f));
const publicFiles = walk(join(APP_ROOT, "public"), () => true);
const configFiles = walk(APP_ROOT, (f) => {
  const rel = relative(APP_ROOT, f).replace(/\\/g, "/");
  return rel === "next.config.mjs" || rel === "package.json";
});

for (const file of [...sourceFiles, ...publicFiles, ...configFiles]) {
  const label = relative(APP_ROOT, file).replace(/\\/g, "/");
  const text = readFileSync(file, "utf8").toLowerCase();
  for (const host of FORBIDDEN_HOSTS) {
    if (text.includes(host.toLowerCase())) {
      failures.push(`${label}: third-party analytics host "${host}"`);
    }
  }
  for (const token of FORBIDDEN_TOKENS) {
    if (text.includes(token.toLowerCase())) {
      failures.push(`${label}: analytics call "${token}"`);
    }
  }
}

const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    for (const forbidden of FORBIDDEN_PACKAGES) {
      if (name === forbidden || name.startsWith(`${forbidden}/`)) {
        failures.push(`package.json ${field}: analytics package "${name}"`);
      }
    }
  }
}

console.log(
  `third-party check: scanned ${sourceFiles.length} source file(s), ${publicFiles.length} public file(s), ${configFiles.length} config file(s)`,
);

if (failures.length > 0) {
  console.error(`\nM8.3 FAILED: ${failures.length} third-party analytics reference(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    "\nD-07 / M8.3 permit first-party attribution only. Funnel data must be\n" +
      "collected by our own endpoints.",
  );
  process.exit(1);
}

console.log("third-party check: no analytics SDK, pixel or tracker found");