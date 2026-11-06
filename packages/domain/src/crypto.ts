import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppEnv } from "@clipppy/contracts";
import { ClipppyError } from "@clipppy/contracts";

const DEV_MATERIAL = "clipppy-local-dev-only-not-for-production";

export function deriveDevKey(label: string): Buffer {
  return createHash("sha256").update(`${DEV_MATERIAL}:${label}`).digest();
}

export function decodeKey(value: string): Buffer {
  const asBase64 = Buffer.from(value, "base64");
  if (asBase64.length === 32) return asBase64;
  return createHash("sha256").update(value).digest();
}

export function loadKeys(
  env: AppEnv,
  raw: Record<string, string | undefined> = process.env,
): { tokenKey: Buffer; chatKey: Buffer; insecureDevFallback: boolean } {
  const token = raw.TOKEN_ENCRYPTION_KEY;
  const chat = raw.CHAT_PSEUDONYM_HMAC_KEY;
  if (env === "production") {
    if (!token || !chat || token.includes("local-dev") || chat.includes("local-dev")) {
      throw new ClipppyError("SECRET_REQUIRED", "Production requires managed token and chat HMAC keys.", 500);
    }
    return { tokenKey: decodeKey(token), chatKey: decodeKey(chat), insecureDevFallback: false };
  }
  return {
    tokenKey: token ? decodeKey(token) : deriveDevKey("token"),
    chatKey: chat ? decodeKey(chat) : deriveDevKey("chat"),
    insecureDevFallback: !token || !chat,
  };
}

export function encryptSecret(plaintext: string, tenantId: string, key: Buffer, version = 1): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(tenantId));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${iv.toString("base64url")}:${tag.toString("base64url")}:${body.toString("base64url")}`;
}

export function decryptSecret(payload: string, tenantId: string, key: Buffer): string {
  const [version, ivB64, tagB64, bodyB64] = payload.split(":");
  if (!version?.startsWith("v") || !ivB64 || !tagB64 || !bodyB64) {
    throw new ClipppyError("TOKEN_CORRUPT", "Stored secret could not be read.", 500);
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(tenantId));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64url")), decipher.final()]).toString("utf8");
}

export function chatterKey(tenantId: string, providerUserId: string, key: Buffer): string {
  return createHmac("sha256", key).update(`${tenantId}:${providerUserId}`).digest("hex").slice(0, 32);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signHmac(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function signObjectToken(
  input: { tenantId: string; objectKey: string; expiresAt: number },
  key: Buffer,
): string {
  const body = Buffer.from(JSON.stringify(input)).toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyObjectToken(
  token: string,
  key: Buffer,
  nowMs: number,
): { tenantId: string; objectKey: string; expiresAt: number } {
  const split = token.lastIndexOf(".");
  if (split <= 0) throw new ClipppyError("URL_INVALID", "Media link is invalid.", 403);
  const body = token.slice(0, split);
  const sig = token.slice(split + 1);
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) throw new ClipppyError("URL_INVALID", "Media link is invalid.", 403);
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    tenantId: string;
    objectKey: string;
    expiresAt: number;
  };
  if (parsed.expiresAt < nowMs) throw new ClipppyError("URL_EXPIRED", "Media link has expired.", 403);
  return parsed;
}
