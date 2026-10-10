import { readFileSync } from "node:fs";
import path from "node:path";
import { envSchema } from "./env.js";

const envExamplePath = path.resolve(__dirname, "../../../.env.example");

const keysInExample = (source: string): string[] =>
  source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split("=")[0]?.trim() ?? "")
    .filter((key) => key.length > 0);

describe(".env.example", () => {
  const exampleKeys = keysInExample(readFileSync(envExamplePath, "utf8"));
  const schemaKeys = Object.keys(envSchema.shape);

  test("documents at least the core variables", () => {
    expect(exampleKeys).toEqual(expect.arrayContaining(["NODE_ENV", "DATABASE_URL", "REDIS_URL", "SESSION_SECRET"]));
  });

  test("declares no key the schema does not know (silent-drop guard)", () => {
    const unknown = exampleKeys.filter((key) => !schemaKeys.includes(key));
    expect(unknown).toEqual([]);
  });

  test("exercises every schema key, so none is undocumented", () => {
    const undocumented = schemaKeys.filter((key) => !exampleKeys.includes(key));
    expect(undocumented).toEqual([]);
  });
});
