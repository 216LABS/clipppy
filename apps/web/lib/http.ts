import { ClipppyError } from "@clipppy/contracts";
import { ZodError } from "zod";
import { getSharedStore, loadKeys, verifyStripeSignature } from "@clipppy/domain";
import { NextResponse } from "next/server";
import { readSession } from "./auth";

export async function requireApiActor() {
  const session = await readSession();
  if (!session) throw new ClipppyError("UNAUTHENTICATED", "Sign in required.", 401);
  return session;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) throw new ClipppyError("CSRF", "Origin is required for this mutation.", 403);
  if (new URL(origin).host !== host) throw new ClipppyError("CSRF", "Origin does not match the host.", 403);
}

export function jsonError(error: unknown) {
  if (error instanceof ClipppyError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "INVALID", message: "Request failed validation." } }, { status: 400 });
  }
  return NextResponse.json({ error: { code: "ERROR", message: "Request failed." } }, { status: 500 });
}

export function assertCron(request: Request) {
  const env = process.env.APP_ENV ?? "local";
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const expected = `Bearer ${secret ?? "local-dev"}`;
  if (env === "production" && !secret) throw new ClipppyError("SECRET_REQUIRED", "CRON_SECRET is required in production.", 500);
  if (header !== expected) throw new ClipppyError("UNAUTHENTICATED", "Cron credential was rejected.", 401);
}

export async function readStripeEvent(request: Request) {
  const raw = await request.text();
  const env = process.env.APP_ENV ?? "local";
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (env === "production" || secret) {
    verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret ?? "", Date.now());
  } else if (request.headers.get("x-clipppy-test") !== "1") {
    throw new ClipppyError("STRIPE_SIGNATURE_INVALID", "Local Stripe simulation requires the test header.", 401);
  }
  return JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, unknown> } };
}

export function mediaKey() {
  return loadKeys((process.env.APP_ENV as "local" | "test" | "production" | undefined) ?? "local").tokenKey;
}

export function store() {
  return getSharedStore();
}
