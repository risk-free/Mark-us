/**
 * Supply-chain gate (mandate M12.3, global rule G9, ADR D-19).
 *
 * Runs `pnpm audit` and enforces one rule: every advisory the toolchain reports
 * must either be absent or be listed in infra/supply-chain-exceptions.json with
 * an owner and an unexpired review date. An unlisted advisory fails the build at
 * ANY severity — this gate is stricter than `pnpm audit --audit-level=high`.
 *
 * Why the exceptions live in a file rather than in pnpm config: pnpm 9.15
 * expresses exclusions through `auditConfig.ignoreCves`, which matches on CVE
 * ids, and both accepted advisories are GHSA-only with no CVE. A committed,
 * diffable, expiring registry is the reviewable form of the same decision.
 *
 * AUDIT_REGISTRY: the official registry is used by default because a mirror
 * (npmmirror.com, configured in some developer profiles) does not implement the
 * audit endpoint and would report zero vulnerabilities — a false green.
 *
 * Usage: node scripts/check-supply-chain.mjs   (exit 0 = acceptable)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = process.env.AUDIT_REGISTRY ?? "https://registry.npmjs.org";
const exceptionsPath = path.join(repoRoot, "infra", "supply-chain-exceptions.json");

// `pnpm audit` exits non-zero whenever it finds anything, which is the normal
// case here — the report is on stdout either way, so a non-zero exit is data.
// pnpm is invoked through npm_execpath when available so no shell is needed.
const auditArgs = ["audit", "--registry", registry, "--json"];
const [command, commandArgs] = process.env.npm_execpath
  ? [process.execPath, [process.env.npm_execpath, ...auditArgs]]
  : ["pnpm", auditArgs];

let raw = "";
try {
  raw = execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (error) {
  raw = typeof error?.stdout === "string" ? error.stdout : String(error?.message ?? "");
  if (process.env.SUPPLY_CHAIN_DEBUG) process.stderr.write(String(error?.stderr ?? ""));
}

const start = raw.indexOf("{");
if (start === -1) {
  process.stderr.write(
    `[supply-chain] pnpm audit returned no JSON report against ${registry}\n`,
  );
  process.exit(1);
}
const report = JSON.parse(raw.slice(start));

const exceptions = JSON.parse(readFileSync(exceptionsPath, "utf8")).exceptions ?? [];
const byGhsa = new Map(exceptions.map((entry) => [entry.ghsa, entry]));

const problems = [];
const reported = [];

for (const [id, advisory] of Object.entries(report.advisories ?? {})) {
  const ghsa = advisory.github_advisory_id ?? advisory.cve_id ?? String(id);
  reported.push(ghsa);

  const exception = byGhsa.get(ghsa);
  if (!exception) {
    problems.push(
      `unlisted advisory ${ghsa} (${advisory.severity}) in ${advisory.module_name}: ${advisory.title}`,
    );
    continue;
  }

  for (const field of ["ghsa", "package", "owner", "reviewBy", "reason", "runtimeExposure"]) {
    if (!exception[field]) problems.push(`exception ${ghsa}: missing required field '${field}'`);
  }
  if (exception.package && advisory.module_name && exception.package !== advisory.module_name) {
    problems.push(
      `exception ${ghsa}: registered for '${exception.package}' but the audit reports '${advisory.module_name}'`,
    );
  }
  const reviewBy = Date.parse(String(exception.reviewBy ?? ""));
  if (Number.isNaN(reviewBy)) {
    problems.push(`exception ${ghsa}: reviewBy is not a valid date (${exception.reviewBy})`);
  } else if (reviewBy < Date.now()) {
    problems.push(
      `exception ${ghsa}: EXPIRED on ${exception.reviewBy}. Renew it with a named owner or delete it`,
    );
  }
}

const stale = exceptions.filter((entry) => entry.fixedUpstream === false && !reported.includes(entry.ghsa));
for (const entry of stale) {
  process.stdout.write(
    `[supply-chain] notice: ${entry.ghsa} (${entry.package}) is no longer reported — delete it from infra/supply-chain-exceptions.json\n`,
  );
}

const counts = report.metadata?.vulnerabilities ?? {};
process.stdout.write(
  `[supply-chain] audit: ${counts.critical ?? 0} critical, ${counts.high ?? 0} high, ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low; ${exceptions.length} accepted exception(s)\n`,
);

if (problems.length > 0) {
  process.stderr.write(
    [`[supply-chain] ${problems.length} problem(s):`, ...problems.map((p) => `  - ${p}`), ""].join("\n"),
  );
  process.exit(1);
}