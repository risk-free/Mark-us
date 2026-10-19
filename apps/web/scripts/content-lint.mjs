#!/usr/bin/env node
/**
 * M8.4 — marketing claims / content compliance lint.
 *
 * Fails the build when marketing copy states or implies a registration
 * guarantee, a success rate, an accuracy figure or a competitor comparison.
 * Disclaimed uses of those phrases ("not a guarantee", "不保证可注册性") are
 * allowed and reported separately, because M8.4 *requires* that copy to exist.
 *
 * Scope:
 *   - src/messages/*.json          all user-facing marketing copy
 *   - src/content/posts/*.json     blog content (ARCH-01 §491 content store)
 *   - src/app/**, src/components/** source, for copy hardcoded outside the
 *     catalogs — the failure mode this catches is "someone typed a claim
 *     straight into a component"
 *
 * Excluded: the two GATE surfaces under app/[locale]/{assess,assistant}. Their
 * copy is pre-existing product wording and their disclosure text is versioned
 * legal copy owned by @markus/tm-data, not marketing copy.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findClaimPhrases } from "./lib/claims.mjs";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Recursively collect files under `dir` matching `predicate`. */
function walk(dir, predicate, found = []) {
  for (const entry of readdirSync(dir)) {
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

/** Every string in a JSON document, with a path for reporting. */
function jsonStrings(value, path = "$", out = []) {
  if (typeof value === "string") {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => jsonStrings(item, `${path}[${index}]`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      jsonStrings(child, `${path}.${key}`, out);
    }
  }
  return out;
}

/**
 * String literals in source, so hardcoded copy is checked too. Comments are not
 * stripped deliberately — a claim in a comment is a claim someone will copy.
 */
function sourceLiterals(text) {
  const literals = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let match = pattern.exec(text);
  while (match !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    // Only prose: skip anything that looks like a path, class or URL.
    if (/[一-鿿]/.test(value) || /[a-z]{3,}/i.test(value)) {
      literals.push(value);
    }
    match = pattern.exec(text);
  }
  return literals;
}

const EXCLUDED_SOURCE = [
  // GATE surfaces — see the header.
  join(APP_ROOT, "src", "app", "[locale]", "assess"),
  join(APP_ROOT, "src", "app", "[locale]", "assistant"),
  // The lint's own vocabulary and the test suite that asserts on it.
  join(APP_ROOT, "scripts"),
  join(APP_ROOT, "src", "messages"),
];

function isExcluded(file) {
  const normalised = file.replace(/\\/g, "/");
  if (normalised.includes("/__snapshots__/")) return true;
  if (/\.test\.[cm]?[jt]sx?$/.test(normalised)) return true;
  return EXCLUDED_SOURCE.some((prefix) => normalised.startsWith(prefix.replace(/\\/g, "/")));
}

const violations = [];
const disclaimers = [];

function scan(label, text) {
  for (const hit of findClaimPhrases(text)) {
    const record = { label, ...hit };
    if (hit.negated) {
      disclaimers.push(record);
    } else {
      violations.push(record);
    }
  }
}

const messageFiles = walk(join(APP_ROOT, "src", "messages"), (f) => f.endsWith(".json"));
const postFiles = walk(join(APP_ROOT, "src", "content"), (f) => f.endsWith(".json"));

for (const file of [...messageFiles, ...postFiles]) {
  const label = relative(APP_ROOT, file).replace(/\\/g, "/");
  for (const { path, value } of jsonStrings(JSON.parse(readFileSync(file, "utf8")))) {
    scan(`${label} ${path}`, value);
  }
}

const sourceFiles = walk(join(APP_ROOT, "src"), (f) => /\.[cm]?[jt]sx?$/.test(f)).filter(
  (f) => !isExcluded(f),
);

for (const file of sourceFiles) {
  const label = relative(APP_ROOT, file).replace(/\\/g, "/");
  for (const literal of sourceLiterals(readFileSync(file, "utf8"))) {
    scan(label, literal);
  }
}

console.log(
  `content-lint: scanned ${messageFiles.length} message file(s), ${postFiles.length} post file(s), ${sourceFiles.length} source file(s)`,
);

if (disclaimers.length > 0) {
  console.log(`  ${disclaimers.length} disallowed-phrase use(s) found as explicit disclaimers:`);
  for (const item of disclaimers) {
    console.log(`    ok  ${item.label}: "${item.phrase}" — …${item.excerpt}…`);
  }
}

if (violations.length > 0) {
  console.error(`\ncontent-lint FAILED: ${violations.length} prohibited claim(s):`);
  for (const item of violations) {
    console.error(`  ${item.label}: "${item.phrase}" — …${item.excerpt}…`);
  }
  console.error(
    "\nM8.4 forbids stating or implying a registration guarantee, a success rate, an\n" +
      "accuracy figure or a competitor comparison. Negate it explicitly if the copy is\n" +
      "a disclaimer, or rephrase.",
  );
  process.exit(1);
}

console.log("content-lint: no prohibited claims found");