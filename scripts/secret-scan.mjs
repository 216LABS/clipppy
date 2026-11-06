import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const skip = new Set(["node_modules", ".next", ".git", "dist", ".venv", "__pycache__", "uploads"]);
const patterns = [
  [/sk_live_[A-Za-z0-9]{8,}/, "stripe live secret"],
  [/AKIA[0-9A-Z]{16}/, "aws access key"],
  [/-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/, "private key"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "slack token"],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|py|js|mjs|json|md|yml|yaml|env|toml|sql)$/.test(entry) && entry !== ".env") out.push(full);
  }
  return out;
}

const hits = [];
for (const file of walk(process.cwd())) {
  if (file.endsWith("scripts/secret-scan.mjs")) continue;
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) hits.push(`${file}: ${label}`);
  }
}
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("secret scan ok");
