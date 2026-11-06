"use server";

import { ClipppyError, type RejectReason } from "@clipppy/contracts";
import {
  applyChatPace,
  advanceFixtureBuffer,
  approveCandidate,
  attestPermission,
  clonePreset,
  createClipHook,
  createManualCandidate,
  createRenderVersion,
  getSharedStore,
  handleStripeEvent,
  IDS,
  loadKeys,
  markIngestConnected,
  priceAllowlist,
  rejectCandidate,
  runPublication,
  saveProfileVersion,
  setPublishKillSwitch,
  stageChannel,
  activateSource,
} from "@clipppy/domain";
import { createMockPublisher } from "@clipppy/publish";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "./auth";

const DEMO = [
  { userId: IDS.userFlip, tenantId: IDS.tenantFlip },
  { userId: IDS.userEditor, tenantId: IDS.tenantFlip },
  { userId: IDS.userViewer, tenantId: IDS.tenantFlip },
  { userId: IDS.userHarbor, tenantId: IDS.tenantHarbor },
];

function isNextRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

function bounce(path: string, error: unknown): never {
  if (isNextRedirect(error)) throw error;
  const code = error instanceof ClipppyError ? error.code : "ERROR";
  redirect(`${path}?error=${encodeURIComponent(code)}`);
}

export async function loginAction(formData: FormData) {
  if ((process.env.APP_ENV ?? "local") === "production") {
    redirect("/login?error=SUPABASE_AUTH_REQUIRED");
  }
  const userId = String(formData.get("user_id") ?? "");
  const persona = DEMO.find((item) => item.userId === userId);
  if (!persona) redirect("/login?error=UNKNOWN_PERSONA");
  const jar = await cookies();
  jar.set("clipppy_user", persona.userId, { httpOnly: true, sameSite: "lax", path: "/" });
  jar.set("clipppy_tenant", persona.tenantId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/streams");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete("clipppy_user");
  jar.delete("clipppy_tenant");
  redirect("/");
}

export async function clipAction(formData: FormData) {
  const session = await requireSession();
  const sessionId = String(formData.get("session_id") ?? "");
  try {
    const desk = getSharedStore();
    advanceFixtureBuffer(desk, sessionId, new Date());
    const created = createManualCandidate(desk, {
      actor: session.actor,
      origin: "dashboard",
      sessionId,
      requestId: String(formData.get("request_id") ?? ""),
      seconds: Number(formData.get("seconds") ?? 45),
      note: String(formData.get("note") ?? ""),
      clipAnyway: formData.get("clip_anyway") === "on",
      now: new Date(),
    });
    redirect(`/streams/${sessionId}?queued=${created.candidate.id}${created.duplicate ? "&duplicate=1" : ""}`);
  } catch (error) {
    bounce(`/streams/${sessionId}`, error);
  }
}

export async function approveAction(formData: FormData) {
  const session = await requireSession();
  const candidateId = String(formData.get("candidate_id") ?? "");
  try {
    if (formData.get("confirm_exact") !== "on") {
      throw new ClipppyError("EXACT_RENDER_REQUIRED", "Confirm the exact render.");
    }
    const destinationIds = formData.getAll("destination_id").map(String);
    approveCandidate(getSharedStore(), {
      actor: session.actor,
      candidateId,
      renderId: String(formData.get("render_id") ?? ""),
      checksum: String(formData.get("checksum") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      destinationIds,
      confirmExact: true,
      now: new Date(),
    });
    redirect(`/review/${candidateId}?approved=1`);
  } catch (error) {
    bounce(`/review/${candidateId}`, error);
  }
}

export async function rejectAction(formData: FormData) {
  const session = await requireSession();
  const candidateId = String(formData.get("candidate_id") ?? "");
  try {
    rejectCandidate(getSharedStore(), {
      actor: session.actor,
      candidateId,
      reason: String(formData.get("reason") ?? "other") as RejectReason,
      note: String(formData.get("note") ?? ""),
      now: new Date(),
    });
    redirect(`/review/${candidateId}?rejected=1`);
  } catch (error) {
    bounce(`/review/${candidateId}`, error);
  }
}

export async function rerenderAction(formData: FormData) {
  const session = await requireSession();
  const candidateId = String(formData.get("candidate_id") ?? "");
  try {
    createRenderVersion(getSharedStore(), { actor: session.actor, candidateId, now: new Date() });
    redirect(`/review/${candidateId}?rerender=1`);
  } catch (error) {
    bounce(`/review/${candidateId}`, error);
  }
}

export async function publishMockAction(formData: FormData) {
  const session = await requireSession();
  const publicationId = String(formData.get("publication_id") ?? "");
  const candidateId = String(formData.get("candidate_id") ?? "");
  try {
    const store = getSharedStore();
    const publication = store.data.publications.find((item) => item.id === publicationId && item.tenantId === session.actor.tenantId);
    if (!publication) throw new ClipppyError("PUBLICATION_NOT_FOUND", "Publication was not found.", 404);
    const destination = store.data.destinations.find((item) => item.id === publication.destinationId);
    if (!destination) throw new ClipppyError("DESTINATION_NOT_FOUND", "Destination was not found.", 404);
    await runPublication(store, publicationId, createMockPublisher(destination.platform), "local");
    redirect(`/review/${candidateId}?published=mock`);
  } catch (error) {
    bounce(`/review/${candidateId}`, error);
  }
}

export async function saveProfileAction(formData: FormData) {
  const session = await requireSession();
  try {
    const next = applyChatPace(clonePreset("busy_gameplay"), {
      sensitivity: Number(formData.get("sensitivity") ?? 40),
      messagesPerMinute: Number(formData.get("messages_per_minute") ?? 30),
      clipsPerHour: Number(formData.get("clips_per_hour") ?? 8),
      clipSeconds: Number(formData.get("clip_seconds") ?? 45),
    });
    if (formData.get("audio") === "on") next.detection.audio_enabled = true;
    if (formData.get("keywords") === "on") next.detection.keyword_enabled = true;
    const saved = saveProfileVersion(getSharedStore(), session.actor, {
      name: "GTA busy gameplay",
      sourceId: session.actor.tenantId === IDS.tenantFlip ? IDS.sourceFlip : null,
      config: next,
      now: new Date(),
    });
    redirect(`/profiles?saved=${saved.version}`);
  } catch (error) {
    bounce("/profiles", error);
  }
}

export async function createHookAction(formData: FormData) {
  const session = await requireSession();
  try {
    const keys = loadKeys("local");
    const source = getSharedStore().data.sources.find((item) => item.tenantId === session.actor.tenantId && !item.revokedAt);
    if (!source) throw new ClipppyError("NOT_AUTHORIZED", "Connect an authorized source first.", 403);
    const created = createClipHook(getSharedStore(), {
      actor: session.actor,
      sourceId: source.id,
      name: String(formData.get("name") ?? "Stream Deck"),
      now: new Date(),
      tokenKey: keys.tokenKey,
    });
    redirect(`/settings?hook=${created.publicId}&secret=${encodeURIComponent(created.secret)}`);
  } catch (error) {
    bounce("/settings", error);
  }
}

export async function killSwitchAction(formData: FormData) {
  const session = await requireSession();
  const store = getSharedStore();
  const user = store.data.users.find((item) => item.id === session.actor.userId);
  try {
    setPublishKillSwitch(
      store,
      { userId: session.actor.userId, isAdmin: store.data.adminEmails.includes(user?.email ?? "") },
      formData.get("halted") === "on",
      new Date(),
    );
    redirect("/admin?saved=1");
  } catch (error) {
    bounce("/admin", error);
  }
}

export async function stripeSimAction(formData: FormData) {
  const session = await requireSession();
  if (session.role !== "owner") bounce("/billing", new ClipppyError("FORBIDDEN", "Only an owner can change billing state."));
  if ((process.env.APP_ENV ?? "local") === "production") bounce("/billing", new ClipppyError("LIVE_POSTING_BLOCKED", "No simulated charges in production."));
  const kind = String(formData.get("kind") ?? "");
  const store = getSharedStore();
  try {
    if (kind === "past_due") {
      handleStripeEvent(
        store,
        { id: `evt_sim_due_${Date.now()}`, type: "invoice.payment_failed", data: { object: { metadata: { tenant_id: session.actor.tenantId } } } },
        priceAllowlist(),
        new Date(),
      );
    } else {
      handleStripeEvent(
        store,
        {
          id: `evt_sim_ok_${Date.now()}`,
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: { tenant_id: session.actor.tenantId, price_id: "price_seat_monthly_test" },
              customer: "cus_sim",
              subscription: "sub_sim",
            },
          },
        },
        priceAllowlist(),
        new Date(),
      );
    }
    redirect("/billing?saved=1");
  } catch (error) {
    bounce("/billing", error);
  }
}

export async function onboardingAction(formData: FormData) {
  const session = await requireSession();
  const store = getSharedStore();
  try {
    attestPermission(store, session.actor, {
      basis: "owned",
      reference: String(formData.get("reference") ?? ""),
      now: new Date(),
    });
    stageChannel(store, session.actor, {
      platform: "twitch",
      platformChannelId: String(formData.get("channel_id") ?? ""),
      login: String(formData.get("login") ?? ""),
    });
    markIngestConnected(store, session.actor, ["user:read:chat"], ["user:read:chat"]);
    const profile = saveProfileVersion(store, session.actor, {
      name: "Onboarding profile",
      sourceId: null,
      config: clonePreset("small_community"),
      now: new Date(),
    });
    void profile;
    if (formData.get("activate") === "on") activateSource(store, session.actor, new Date());
    redirect("/onboarding?saved=1");
  } catch (error) {
    bounce("/onboarding", error);
  }
}
