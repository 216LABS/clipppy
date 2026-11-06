import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./schema";

export function migrationSql(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "../migrations/0001_init.sql"), "utf8");
}
