import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function repoRoot(): string {
  const fromEnv = process.env.CLIPPPY_ROOT;
  if (fromEnv && existsSync(path.join(fromEnv, "pnpm-workspace.yaml"))) return fromEnv;
  let dir = process.cwd();
  for (let hop = 0; hop < 8; hop += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function sampleMediaPath(): string {
  return path.join(repoRoot(), "fixtures/media/synthetic-vertical.mp4");
}

export function sampleMediaChecksum(): string {
  const file = sampleMediaPath();
  if (!existsSync(file)) return "4ed62ee4a4b84c7fc4bc1b084a7ada711206a33f61cdf69628a9223f424cf885";
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
