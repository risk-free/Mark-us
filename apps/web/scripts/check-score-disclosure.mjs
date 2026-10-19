#!/usr/bin/env node
/**
 * M6.2 — "a static check that no screen renders a score without the disclaimer
 * block". Mandates 04:409-411 makes a missing disclaimer a halt condition, so
 * this is enforced rather than trusted to review.
 *
 * Rule: any file that renders a probability or signal score must also render a
 * disclosure. Two shapes satisfy it:
 *
 *   - it renders `DisclaimerBlock` / `ScorePanel` / `GuidancePanel` directly, or
 *   - it renders `ScoreValue`, whose only caller is `ScorePanel`
 *
 * Score-bearing is detected on the identifiers that actually produce a score:
 * `pRegistration`, `ScoreValue`, `headlineConfidence`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

const SCORE_TOKENS = ["pRegistration", "ScoreValue", "headlineConfidence"];
const DISCLOSURE_TOKENS = ["DisclaimerBlock", "ScorePanel", "GuidancePanel"];

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".turbo") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (/\.[jt]sx?$/.test(full)) {
      found.push(full);
    }
  }
  return found;
}

const files = walk(join(APP_ROOT, "src"));
const failures = [];
let checked = 0;

for (const file of files) {
  const label = relative(APP_ROOT, file).replace(/\\/g, "/");
  if (/\.test\.[jt]sx?$/.test(label)) continue;

  const text = readFileSync(file, "utf8");
  const isScoreBearing = SCORE_TOKENS.some((token) => text.includes(token));
  if (!isScoreBearing) continue;

  checked += 1;
  const hasDisclosure = DISCLOSURE_TOKENS.some((token) => text.includes(token));
  if (!hasDisclosure) {
    failures.push(
      `${label}: renders a score (${SCORE_TOKENS.filter((t) => text.includes(t)).join(", ")}) ` +
        "but no DisclaimerBlock / ScorePanel / GuidancePanel",
    );
  }
}

console.log(`score-disclosure: checked ${checked} score-bearing file(s) of ${files.length}`);

if (failures.length > 0) {
  console.error(`\nM6.2 FAILED: ${failures.length} score surface(s) without a disclaimer:`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    "\nM6.2: every surface displaying a score must also display the disclaimer block,\n" +
      "the model version and the disclaimer version. This halts the phase until fixed.",
  );
  process.exit(1);
}

console.log("score-disclosure: every score-bearing surface carries its disclaimer");