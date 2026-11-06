const SECRET_KEY = /token|secret|authorization|cookie|password|ciphertext|signed/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : redact(inner);
    }
    return output;
  }
  if (typeof value === "string" && /^(ya29\.|sk_live_|sk_test_)/.test(value)) return "[redacted]";
  return value;
}
