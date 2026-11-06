import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist" || entry === ".venv") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...files(full));
    else if (/\.(ts|tsx|py)$/.test(entry)) found.push(full);
  }
  return found;
}

describe("approval invariant", () => {
  it("has no auto-publish bypass in application code", () => {
    const roots = ["packages", "apps", "workers"].map((dir) => path.resolve(process.cwd(), dir));
    const banned = ["skipApproval", "AUTO_PUBLISH", "bypassApproval", "bypassRls"];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of files(root)) {
        if (file.endsWith("invariants.test.ts")) continue;
        const text = readFileSync(file, "utf8");
        for (const token of banned) {
          if (text.includes(token)) hits.push(`${file}:${token}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
