#!/usr/bin/env node
/**
 * i18n key parity gate (SCHEDULE 1.3, 01-system-design.md §8 "CI fails on
 * missing keys").
 *
 * Fails when any key is missing from a catalog or present in one catalog and
 * orphaned in another, when a value is blank, or when the placeholders used by a
 * key differ between locales. Placeholder drift is the failure mode this really
 * catches: a translated `readingMinutes` that drops `{minutes}` renders the
 * literal text "{minutes} min read" on one locale and a sentence on another.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES_DIR = fileURLToPath(new URL("../src/messages", import.meta.url));

/** Locale set is owned by src/i18n/locales.ts; re-stated here so the gate reads
 *  the catalogs straight off disk without needing a TypeScript loader. */
const CATALOGS = ["zh-CN", "en", "zh-TW"];

function flatten(value, prefix = "", out = {}) {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (Array.isArray(value)) {
    out[prefix] = value.join("");
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix === "" ? key : `${prefix}.${key}`, out);
    }
  } else if (value === null || value === undefined) {
    out[prefix] = "";
  }
  return out;
}

function placeholders(text) {
  return [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const catalogs = {};
const failures = [];

for (const locale of CATALOGS) {
  const file = join(MESSAGES_DIR, `${locale}.json`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`${locale}.json: unreadable — ${error.message}`);
    continue;
  }
  catalogs[locale] = flatten(parsed);
}

const available = Object.keys(catalogs);
if (available.length !== CATALOGS.length) {
  console.error(
    `i18n parity FAILED: expected ${CATALOGS.length} catalogs, found ${available.length}`,
  );
  process.exit(1);
}

/** The reference is the catalog with the most keys, so an orphan is visible. */
const referenceLocale = CATALOGS.reduce((best, locale) =>
  Object.keys(catalogs[locale]).length > Object.keys(catalogs[best]).length ? locale : best,
);
const referenceKeys = new Set(Object.keys(catalogs[referenceLocale]));

const totalKeys = referenceKeys.size;
console.log(
  `i18n parity: ${CATALOGS.length} catalogs, reference "${referenceLocale}" with ${totalKeys} keys`,
);

for (const locale of CATALOGS) {
  const keys = new Set(Object.keys(catalogs[locale]));

  for (const key of referenceKeys) {
    if (!keys.has(key)) {
      failures.push(`${locale}.json: missing key "${key}"`);
    }
  }
  for (const key of keys) {
    if (!referenceKeys.has(key)) {
      failures.push(`${locale}.json: orphan key "${key}" (absent from ${referenceLocale})`);
    }
  }

  for (const [key, value] of Object.entries(catalogs[locale])) {
    if (value.trim() === "") {
      failures.push(`${locale}.json: "${key}" is blank`);
    }
  }
}

// Placeholder parity against the reference value for the same key.
for (const [key, referenceValue] of Object.entries(catalogs[referenceLocale])) {
  const expected = placeholders(referenceValue);
  if (expected.length === 0) continue;
  for (const locale of CATALOGS) {
    if (locale === referenceLocale) continue;
    const actual = placeholders(catalogs[locale][key] ?? "");
    if (actual.join(",") !== expected.join(",")) {
      failures.push(
        `${locale}.json: "${key}" placeholders [${actual.join(", ")}] do not match ${referenceLocale} [${expected.join(", ")}]`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\ni18n parity FAILED: ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`i18n parity: all ${CATALOGS.length} catalogs match on ${totalKeys} keys`);