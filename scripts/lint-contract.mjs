/**
 * Contract lint (mandate M1.1, GATE).
 *
 * docs/architecture/03-api-contract.yaml is the single source of truth for the
 * API surface. This gate fails the build when the contract and the code drift:
 *
 *   1. the document parses as YAML and declares OpenAPI 3.1.x
 *   2. every `$ref` resolves inside the document
 *   3. every operation carries `x-contract-status` from the closed vocabulary
 *   4. every operation's `x-permission` exists in packages/core's PERMISSIONS
 *      (M2.1: the contract vocabulary is the runtime vocabulary)
 *   5. every `{placeholder}` in a path is declared in that operation's parameters
 *   6. no operation declares an unknown `x-` extension key
 *
 * Usage: node scripts/lint-contract.mjs   (exit 0 = contract is self-consistent)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(repoRoot, "docs", "architecture", "03-api-contract.yaml");
const rbacSourcePath = path.join(repoRoot, "packages", "core", "src", "rbac.ts");

const CONTRACT_STATUS = /^(final|provisional|PENDING-P\d+)$/;
const KNOWN_EXTENSIONS = new Set([
  "x-phase",
  "x-contract-status",
  "x-permission",
  "x-scope",
  "x-audit",
  "x-idempotent",
  "x-ratelimit",
  "x-rbac",
]);

const problems = [];
const fail = (message) => problems.push(message);

const document = parse(readFileSync(contractPath, "utf8"));

if (!/^3\.1\./.test(String(document?.openapi ?? ""))) {
  fail(`openapi must be 3.1.x, found ${JSON.stringify(document?.openapi)}`);
}
if (!document?.info?.title || !document?.info?.version) {
  fail("info.title and info.version are required");
}

const operations = [];
for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    operations.push({ routePath, method, operation, pathItem });
  }
}

if (operations.length === 0) fail("contract declares no operations");

for (const { routePath, method, operation, pathItem } of operations) {
  const where = `${method.toUpperCase()} ${routePath}`;

  if (!CONTRACT_STATUS.test(String(operation["x-contract-status"]))) {
    fail(`${where}: missing or invalid x-contract-status (${operation["x-contract-status"]})`);
  }
  if (!operation["x-phase"]) {
    fail(`${where}: missing x-phase`);
  }
  if (operation["x-permission"] && !operation["x-scope"] && operation["x-contract-status"] !== "final") {
    // not an error, recorded for visibility
  }
  if (typeof operation["x-permission"] === "string" && operation["x-permission"].includes(",")) {
    fail(`${where}: x-permission must name exactly one permission, found "${operation["x-permission"]}"`);
  }
  for (const key of Object.keys(operation)) {
    if (key.startsWith("x-") && !KNOWN_EXTENSIONS.has(key)) {
      fail(`${where}: unknown extension ${key}`);
    }
  }

  // Path parameters may be declared at the path-item level (shared by every
  // operation) or per operation, and may be a $ref into components/parameters.
  const declared = new Set();
  for (const candidate of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    if (typeof candidate?.name === "string") {
      declared.add(candidate.name);
      continue;
    }
    if (typeof candidate?.$ref === "string") {
      const pointer = candidate.$ref.replace("#/components/parameters/", "");
      const referenced = document.components?.parameters?.[pointer];
      if (typeof referenced?.name === "string") declared.add(referenced.name);
    }
  }
  for (const placeholder of (routePath.match(/\{[^}]+\}/g) ?? []).map((p) => p.slice(1, -1))) {
    if (!declared.has(placeholder)) {
      fail(`${where}: path parameter '{${placeholder}}' is not declared in parameters`);
    }
  }
}

// $ref resolution
const resolvePointer = (pointer) => {
  let node = document;
  for (const rawSegment of pointer.replace(/^#\//, "").split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    node = node?.[segment];
    if (node === undefined) return false;
  }
  return true;
};

const visit = (node, trail) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => visit(item, `${trail}[${index}]`));
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref") {
      if (typeof value !== "string" || !value.startsWith("#/") || !resolvePointer(value)) {
        fail(`unresolvable $ref ${JSON.stringify(value)} at ${trail}`);
      }
      continue;
    }
    visit(value, `${trail}.${key}`);
  }
};
visit(document, "$");

// contract vocabulary must exist in the runtime matrix
const rbacSource = readFileSync(rbacSourcePath, "utf8");
const permissionsBlock =
  /export const PERMISSIONS = \[([\s\S]*?)\] as const;/.exec(rbacSource)?.[1] ?? "";
const runtimePermissions = new Set(
  [...permissionsBlock.matchAll(/^\s{2}"([a-z][a-zA-Z.]*)",$/gm)].map((m) => m[1]),
);
if (runtimePermissions.size === 0) {
  fail("could not read the PERMISSIONS array from packages/core/src/rbac.ts");
}
for (const { routePath, method, operation } of operations) {
  const permission = operation["x-permission"];
  if (typeof permission !== "string" || permission.length === 0) continue;
  if (!runtimePermissions.has(permission)) {
    fail(`${method.toUpperCase()} ${routePath}: x-permission '${permission}' is not in packages/core PERMISSIONS`);
  }
}

if (problems.length > 0) {
  process.stderr.write(
    [`[contract] ${problems.length} problem(s) in 03-api-contract.yaml:`, ...problems.map((p) => `  - ${p}`), ""].join("\n"),
  );
  process.exit(1);
}

process.stdout.write(
  `[contract] ok: ${operations.length} operations, ${runtimePermissions.size} runtime permissions, all $refs resolve\n`,
);
