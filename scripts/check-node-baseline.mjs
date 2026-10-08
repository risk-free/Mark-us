/**
 * Single Node major gate (mandate M1.6, halt item OPEN-06).
 *
 * The architecture requires one Node major, identical in every place it is
 * declared: every package.json `engines.node`, every infra/Dockerfile.* base
 * image, and the CI `node-version`. A file that pins a different major, or that
 * pins no major at all, fails the build.
 *
 * Usage: node scripts/check-node-baseline.mjs   (exit 0 = consistent)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_MAJOR = 22;

const walk = (dir, predicate, found = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".next" || entry === "dist") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, predicate, found);
    } else if (predicate(entry)) {
      found.push(full);
    }
  }
  return found;
};

const findings = [];

const add = (file, line, major) => {
  findings.push({ file: path.relative(repoRoot, file), line, major: major ?? "none" });
};

for (const file of walk(repoRoot, (name) => name === "package.json")) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const engines = pkg.engines?.node;
  if (typeof engines !== "string") {
    add(file, 1, null);
    continue;
  }
  const major = /^[\^~>=<\s]*(\d+)/.exec(engines)?.[1];
  if (major !== String(EXPECTED_MAJOR)) add(file, 1, major);
}

for (const file of walk(path.join(repoRoot, "infra"), (name) => name.startsWith("Dockerfile"))) {
  const source = readFileSync(file, "utf8");
  const major = /^FROM node:(\d+)/m.exec(source)?.[1];
  if (major !== String(EXPECTED_MAJOR)) add(file, 1, major);
}

for (const file of walk(path.join(repoRoot, ".github", "workflows"), (name) => name.endsWith(".yml"))) {
  const source = readFileSync(file, "utf8");
  if (!/node-version:/.test(source)) continue;
  const majors = [...source.matchAll(/node-version:\s*"?(\d+)/g)].map((match) => match[1]);
  for (const major of majors) {
    if (major !== String(EXPECTED_MAJOR)) add(file, null, major);
  }
}

if (findings.length > 0) {
  process.stderr.write(
    [
      `[node] NODE BASELINE VIOLATION — every declaration must be Node ${EXPECTED_MAJOR} (M1.6):`,
      ...findings.map((f) => `  ${f.file}:${f.line} declares major ${f.major}`),
      "",
    ].join("\n"),
  );
  process.exit(1);
}

process.stdout.write(`[node] every Node declaration is ${EXPECTED_MAJOR}\n`);
