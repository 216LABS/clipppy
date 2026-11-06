import { describe, expect, it } from "vitest";
import { createMockPublisher } from "@clipppy/publish";
import { deriveDevKey } from "./crypto";
import { approveCandidate, createRenderVersion, markRenderReady, rejectCandidate } from "./approval";
import { ingestChatCommand } from "./chat-ingest";
import { parseClipCommand, senderAllowed } from "./commands";
import { evaluateDetector } from "./evaluation";
import { applyRecommendation, recommendProfileAdjustments } from "./feedback";
import { createManualCandidate } from "./manual";
import { runPublication, setPublishKillSwitch } from "./publish-runner";
import { clonePreset } from "./profiles";
import { sweepRetention } from "./retention";
import { activateSource, attestPermission, claimRecorder, markIngestConnected, recordDiscovery, revokeSource, saveProfileVersion, stageChannel, startSession } from "./sources";
import { handleStripeEvent, priceAllowlist, verifyStripeSignature } from "./stripe";
import { emptyStore, defaultCaps, type Actor } from "./store";
import { verifyObjectToken, signObjectToken } from "./crypto";
import { redact } from "./redact";
import { getTimeline } from "./queries";
import { createHmac } from "node:crypto";
import { handleClipHook, createClipHook } from "./webhook";
import { signHmac } from "./crypto";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const SESSION = "55555555-5555-4555-8555-555555555551";
const SOURCE = "33333333-3333-4333-8333-333333333331";
const NOW = new Date("2026-11-06T18:00:00.000Z");

function lab() {
  const store = emptyStore();
  store.data.users.push(
    { id: USER, email: "flip@216labs.test", displayName: "Flip" },
    { id: VIEWER, email: "viewer@216labs.test", displayName: "Viewer" },
  );
  store.data.tenants.push(
    { id: TENANT, slug: "gta6-flip-test", displayName: "GTA 6", status: "active", isInternal: true, legalHold: false, createdAt: NOW.toISOString() },
    { id: OTHER, slug: "harbor-synthetic", displayName: "Harbor", status: "active", isInternal: false, legalHold: false, createdAt: NOW.toISOString() },
  );
  store.data.memberships.push(
    { tenantId: TENANT, userId: USER, role: "owner" },
    { tenantId: TENANT, userId: VIEWER, role: "viewer" },
    { tenantId: OTHER, userId: USER, role: "owner" },
  );
  for (const tenantId of [TENANT, OTHER]) {
    store.data.entitlements.push({
      tenantId,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      priceId: null,
      status: "active",
      currentPeriodEnd: new Date(NOW.getTime() + 86_400_000).toISOString(),
      seats: 1,
      caps: defaultCaps(),
      graceDays: 7,
      updatedAt: NOW.toISOString(),
    });
  }
  store.data.sources.push({
    id: SOURCE,
    tenantId: TENANT,
    platform: "twitch",
    platformChannelId: "flip-gta6-test",
    channelLogin: "flip_gta6_test",
    permissionBasis: "owned",
    permissionReference: "owned test channel",
    permissionGrantedAt: NOW.toISOString(),
    revokedAt: null,
    senderPolicy: { mode: "broadcaster_and_mods", allowlist: [] },
    createdAt: NOW.toISOString(),
  });
  const profileId = crypto.randomUUID();
  store.data.profiles.push({
    id: profileId,
    tenantId: TENANT,
    sourceId: SOURCE,
    name: "busy",
    version: 1,
    isActive: true,
    config: clonePreset("busy_gameplay"),
    createdBy: USER,
    createdAt: NOW.toISOString(),
  });
  store.data.sessions.push({
    id: SESSION,
    tenantId: TENANT,
    sourceId: SOURCE,
    providerSessionId: null,
    title: "Rehearsal",
    gameId: "gta6",
    gameName: "Grand Theft Auto VI",
    language: "en",
    startedAt: new Date(NOW.getTime() - 600_000).toISOString(),
    endedAt: null,
    status: "live",
    profileId,
    profileVersion: 1,
    recorderWorker: null,
    recorderLeaseUntil: null,
    recorderEpoch: 0,
  });
  for (let index = 0; index < 18; index += 1) {
    store.data.segments.push({
      id: crypto.randomUUID(),
      tenantId: TENANT,
      sessionId: SESSION,
      sequence: index + 1,
      objectKey: `tenants/${TENANT}/segments/${index}.ts`,
      startedAtMs: NOW.getTime() - 120_000 + index * 10_000,
      durationMs: 10_000,
      sha256: "cd".repeat(32),
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    });
  }
  const actor: Actor = { type: "user", userId: USER, tenantId: TENANT };
  return { store, actor, profileId };
}

describe("manual queue", () => {
  it("is idempotent, dedupes a double click, and still works while detection would be cold", () => {
    const { store, actor } = lab();
    const first = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: "99999999-9999-4999-8999-999999999999",
      now: NOW,
      note: "bank turn",
    });
    const again = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: "99999999-9999-4999-8999-999999999999",
      now: NOW,
    });
    expect(again.duplicate).toBe(true);
    expect(again.candidate.id).toBe(first.candidate.id);
    const overlap = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: "99999999-9999-4999-8999-999999999998",
      now: new Date(NOW.getTime() + 1000),
    });
    expect(overlap.duplicate).toBe(true);
    const forced = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: "99999999-9999-4999-8999-999999999997",
      now: new Date(NOW.getTime() + 2000),
      clipAnyway: true,
    });
    expect(forced.duplicate).toBe(false);
    expect(first.candidate.state).toBe("queued");
    expect(store.data.approvals).toHaveLength(0);
    expect(first.candidate.startOffsetMs).toBeLessThanOrEqual(-10_000);
  });

  it("blocks viewers, other tenants, expired buffers, and chat spam", () => {
    const { store, actor } = lab();
    expect(() =>
      createManualCandidate(store, {
        actor: { type: "user", userId: VIEWER, tenantId: TENANT },
        origin: "dashboard",
        sessionId: SESSION,
        requestId: crypto.randomUUID(),
        now: NOW,
      }),
    ).toThrow(/cannot do that/);
    expect(() =>
      createManualCandidate(store, {
        actor: { type: "user", userId: USER, tenantId: OTHER },
        origin: "dashboard",
        sessionId: SESSION,
        requestId: crypto.randomUUID(),
        now: NOW,
      }),
    ).toThrow(/another tenant/);
    expect(() =>
      createManualCandidate(store, {
        actor,
        origin: "dashboard",
        sessionId: SESSION,
        requestId: crypto.randomUUID(),
        now: NOW,
        anchorAt: new Date(NOW.getTime() - 86_400_000),
      }),
    ).toThrow(/no longer covers/);

    for (let index = 0; index < 6; index += 1) {
      ingestChatCommand(store, {
        tenantId: TENANT,
        sessionId: SESSION,
        providerEventId: `chat-${index}`,
        text: "!clip 30",
        sender: { providerUserId: "mod-1", role: "moderator", isBot: false, isSelf: false },
        occurredAt: NOW,
        now: new Date(NOW.getTime() + index * 1000),
        chatKey: deriveDevKey("chat"),
        auditUserId: USER,
      });
    }
    expect(() =>
      ingestChatCommand(store, {
        tenantId: TENANT,
        sessionId: SESSION,
        providerEventId: "chat-overflow",
        text: "!clip",
        sender: { providerUserId: "mod-1", role: "moderator", isBot: false, isSelf: false },
        occurredAt: NOW,
        now: new Date(NOW.getTime() + 7000),
        chatKey: deriveDevKey("chat"),
        auditUserId: USER,
      }),
    ).toThrow(/Too many/);
  });
});

describe("commands and hooks", () => {
  it("parses !clip and fails closed on unknown roles", () => {
    expect(parseClipCommand("!clip")).toEqual({});
    expect(parseClipCommand("!clip 45 boss fight")).toEqual({ seconds: 45, note: "boss fight" });
    expect(parseClipCommand("!clippy")).toBeNull();
    expect(parseClipCommand("please !clip")).toBeNull();
    expect(senderAllowed({ providerUserId: "1", role: "subscriber", isBot: false, isSelf: false }, { mode: "broadcaster_and_mods", allowlist: [] })).toBe(false);
    expect(senderAllowed({ providerUserId: "1", role: "unknown", isBot: false, isSelf: false }, { mode: "broadcaster_and_mods", allowlist: [] })).toBe(false);
    expect(senderAllowed({ providerUserId: "1", role: "moderator", isBot: true, isSelf: false }, { mode: "broadcaster_and_mods", allowlist: [] })).toBe(false);
  });

  it("verifies signed hooks and rejects replay, skew, and revoked secrets", () => {
    const { store, actor } = lab();
    const key = deriveDevKey("token");
    const created = createClipHook(store, { actor, sourceId: SOURCE, name: "Deck", now: NOW, tokenKey: key });
    const body = JSON.stringify({ session_id: SESSION, seconds: 30, note: "deck" });
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const signature = `v1=${signHmac(created.secret, `${timestamp}.${body}`)}`;
    const ok = handleClipHook(store, {
      publicId: created.publicId,
      rawBody: body,
      timestamp,
      eventId: "evt-1",
      signature,
      now: NOW,
      tokenKey: key,
      actorUserId: USER,
    });
    expect(ok.status).toBe(202);
    expect(ok.body).not.toHaveProperty("secret");
    const replay = handleClipHook(store, {
      publicId: created.publicId,
      rawBody: body,
      timestamp,
      eventId: "evt-1",
      signature,
      now: NOW,
      tokenKey: key,
      actorUserId: USER,
    });
    expect(replay.status).toBe(200);
    expect(replay.body.candidate_id).toBe(ok.body.candidate_id);
    expect(() =>
      handleClipHook(store, {
        publicId: created.publicId,
        rawBody: body.replace("30", "45"),
        timestamp,
        eventId: "evt-2",
        signature,
        now: NOW,
        tokenKey: key,
        actorUserId: USER,
      }),
    ).toThrow(/signature/);
    expect(() =>
      handleClipHook(store, {
        publicId: created.publicId,
        rawBody: body,
        timestamp: String(Math.floor(NOW.getTime() / 1000) - 600),
        eventId: "evt-3",
        signature: `v1=${signHmac(created.secret, `${Math.floor(NOW.getTime() / 1000) - 600}.${body}`)}`,
        now: NOW,
        tokenKey: key,
        actorUserId: USER,
      }),
    ).toThrow(/five minutes/);
  });
});

describe("approval and publish", () => {
  it("requires a human checksum match and refuses a changed render", async () => {
    const { store, actor } = lab();
    const created = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: crypto.randomUUID(),
      now: NOW,
    });
    const checksum = "ab".repeat(32);
    const render = markRenderReady(store, {
      tenantId: TENANT,
      renderId: createRenderVersion(store, { actor, candidateId: created.candidate.id, now: NOW }).id,
      checksum,
      objectKey: `tenants/${TENANT}/renders/cut.mp4`,
      probe: { videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920, durationMs: 2000 },
      now: NOW,
    });
    expect(created.candidate.state).toBe("review");
    const destinationId = crypto.randomUUID();
    store.data.destinations.push({
      id: destinationId,
      tenantId: TENANT,
      platform: "youtube",
      label: "Shorts",
      tokenCiphertext: "v1:cipher",
      scopes: ["youtube.upload"],
      status: "connected",
      appVisibility: "unaudited",
      allowedVisibility: ["private", "unlisted"],
      createdAt: NOW.toISOString(),
    });
    expect(() =>
      approveCandidate(store, {
        actor: { type: "user", userId: VIEWER, tenantId: TENANT },
        candidateId: created.candidate.id,
        renderId: render.id,
        checksum,
        title: "Exit",
        description: "Test",
        tags: ["gta"],
        destinationIds: [destinationId],
        confirmExact: true,
        now: NOW,
      }),
    ).toThrow(/cannot do that/);
    const approved = approveCandidate(store, {
      actor,
      candidateId: created.candidate.id,
      renderId: render.id,
      checksum,
      title: "Exit",
      description: "Authorized test cut",
      tags: ["gta"],
      destinationIds: [destinationId],
      confirmExact: true,
      now: NOW,
    });
    const calls: unknown[] = [];
    const adapter = createMockPublisher("youtube", calls as never);
    const published = await runPublication(store, approved.publications[0]!.id, adapter, "test");
    expect(published.duplicate).toBe(false);
    const again = await runPublication(store, approved.publications[0]!.id, adapter, "test");
    expect(again.duplicate).toBe(true);
    expect(calls).toHaveLength(1);

    const next = createRenderVersion(store, { actor, candidateId: created.candidate.id, now: NOW });
    expect(next.version).toBe(2);
    await expect(runPublication(store, approved.publications[0]!.id, adapter, "test")).rejects.toThrow(/newer render/);
    expect(calls).toHaveLength(1);
  });

  it("never uploads a rejection", async () => {
    const { store, actor } = lab();
    const created = createManualCandidate(store, {
      actor,
      origin: "dashboard",
      sessionId: SESSION,
      requestId: crypto.randomUUID(),
      now: NOW,
    });
    createRenderVersion(store, { actor, candidateId: created.candidate.id, now: NOW });
    const render = store.data.renders.find((item) => item.candidateId === created.candidate.id)!;
    markRenderReady(store, {
      tenantId: TENANT,
      renderId: render.id,
      checksum: "cd".repeat(32),
      objectKey: `tenants/${TENANT}/renders/nope.mp4`,
      probe: { videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920, durationMs: 1500 },
      warnings: ["music_risk"],
      now: NOW,
    });
    rejectCandidate(store, { actor, candidateId: created.candidate.id, reason: "music_risk", now: NOW });
    expect(store.data.publications).toHaveLength(0);
    expect(created.candidate.state).toBe("rejected");
  });
});

describe("entitlement, stripe, retention, discovery", () => {
  it("stops capture when past due and ignores a client price", () => {
    const { store, actor } = lab();
    const entitlement = store.data.entitlements.find((item) => item.tenantId === TENANT)!;
    entitlement.stripeSubscriptionId = "sub_1";
    handleStripeEvent(
      store,
      {
        id: "evt_fail",
        type: "invoice.payment_failed",
        data: { object: { metadata: { tenant_id: TENANT }, subscription: "sub_1" } },
      },
      priceAllowlist(),
      NOW,
    );
    expect(store.data.tenants[0]!.status).toBe("past_due");
    expect(() =>
      createManualCandidate(store, { actor, origin: "dashboard", sessionId: SESSION, requestId: crypto.randomUUID(), now: NOW }),
    ).toThrow(/does not allow render/);
    expect(() =>
      handleStripeEvent(
        store,
        {
          id: "evt_bad_price",
          type: "checkout.session.completed",
          data: { object: { metadata: { tenant_id: OTHER, price_id: "price_evil" }, client_reference_id: OTHER, customer: "cus", subscription: "sub" } },
        },
        priceAllowlist(),
        NOW,
      ),
    ).toThrow(/not the seat price/);
    const duplicate = handleStripeEvent(
      store,
      { id: "evt_fail", type: "invoice.payment_failed", data: { object: { metadata: { tenant_id: TENANT } } } },
      priceAllowlist(),
      NOW,
    );
    expect(duplicate.duplicate).toBe(true);
  });

  it("does not authorize a discovered channel and isolates tenants", () => {
    const { store, actor } = lab();
    const hit = recordDiscovery(
      store,
      actor,
      { platform: "twitch", platformChannelId: "stranger", login: "stranger", gameId: "gta6", viewerCount: 1000, language: "en" },
      NOW,
    );
    expect(hit.authorized).toBe(false);
    expect(() => startSession(store, actor, { sourceId: "missing", title: "nope", now: NOW })).toThrow(/not an authorized source/);
    attestPermission(store, actor, { basis: "written_permission", reference: "letter 12", now: NOW });
    stageChannel(store, actor, { platform: "twitch", platformChannelId: "stranger", login: "stranger" });
    expect(() => activateSource(store, actor, NOW)).toThrow(/Ingest/);
    markIngestConnected(store, actor, ["user:read:chat"], ["user:read:chat"]);
    saveProfileVersion(store, actor, { name: "new", sourceId: null, config: clonePreset("busy_gameplay"), now: NOW });
    const source = activateSource(store, actor, NOW);
    expect(source.permissionReference).toMatch(/letter 12/);
    const timeline = getTimeline(store, actor, SESSION);
    expect(JSON.stringify(timeline)).not.toMatch(/messageRedacted|raw username/);
    revokeSource(store, actor, SOURCE, NOW);
    expect(store.data.sessions.find((item) => item.id === SESSION)?.status).toBe("ended");
  });

  it("sweeps expired media unless a legal hold is set", () => {
    const { store } = lab();
    store.data.segments[0]!.expiresAt = new Date(NOW.getTime() - 1000).toISOString();
    store.data.chat.push({
      id: "chat-1",
      tenantId: TENANT,
      sessionId: SESSION,
      providerEventId: "old",
      occurredAt: new Date(NOW.getTime() - 8 * 86_400_000).toISOString(),
      chatterKey: "abc",
      messageRedacted: "hello",
      rawRef: "raw",
    });
    const swept = sweepRetention(store, NOW);
    expect(swept.segments).toBe(1);
    expect(swept.chats).toBe(1);
    store.data.tenants[0]!.legalHold = true;
    store.data.segments[0]!.expiresAt = new Date(NOW.getTime() - 1000).toISOString();
    expect(sweepRetention(store, NOW).segments).toBe(0);
  });

  it("recommends profile changes without applying them", () => {
    const config = clonePreset("busy_gameplay");
    const reviews = Array.from({ length: 5 }, () => ({ outcome: "rejected" as const, reason: "wrong_window" as const }));
    const [recommendation] = recommendProfileAdjustments(config, reviews);
    expect(recommendation?.id).toBe("more_preroll");
    expect(() => applyRecommendation(config, recommendation!, false)).toThrow(/never applied/);
    const next = applyRecommendation(config, recommendation!, true);
    expect(next.window.pre_seconds).toBe(config.window.pre_seconds + 5);
    expect(config.window.pre_seconds).toBe(15);
  });

  it("omits recall until the stream is fully annotated", () => {
    const partial = evaluateDetector({
      annotations: [{ startMs: 0, endMs: 10_000 }],
      candidates: [{ startMs: 0, endMs: 10_000 }],
      fullyAnnotated: false,
    });
    expect(partial.recall).toBeNull();
    expect(partial.note).toMatch(/omitted/);
    const full = evaluateDetector({
      annotations: [{ startMs: 0, endMs: 10_000 }],
      candidates: [{ startMs: 0, endMs: 10_000 }],
      fullyAnnotated: true,
    });
    expect(full.precisionAtReview).toBe(1);
    expect(full.recall).toBe(1);
  });
});

describe("recorder, stripe signature, urls, redact", () => {
  it("transfers recorder ownership only after the lease expires", () => {
    const { store } = lab();
    const first = claimRecorder(store, SESSION, TENANT, "cpu-a", NOW, 30_000);
    expect(first.epoch).toBe(1);
    expect(() => claimRecorder(store, SESSION, TENANT, "cpu-b", NOW, 30_000)).toThrow(/owns this session/);
    const second = claimRecorder(store, SESSION, TENANT, "cpu-b", new Date(NOW.getTime() + 31_000), 30_000);
    expect(second.epoch).toBe(2);
  });

  it("checks stripe signatures, signed urls, and redaction", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ id: "evt" });
    const timestamp = String(Math.floor(NOW.getTime() / 1000));
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, NOW.getTime());
    expect(() => verifyStripeSignature(body, `t=${timestamp},v1=deadbeef`, secret, NOW.getTime())).toThrow(/does not match/);
    const key = deriveDevKey("token");
    const token = signObjectToken({ tenantId: TENANT, objectKey: `tenants/${TENANT}/renders/a.mp4`, expiresAt: NOW.getTime() + 1000 }, key);
    expect(verifyObjectToken(token, key, NOW.getTime()).tenantId).toBe(TENANT);
    expect(() => verifyObjectToken(token, key, NOW.getTime() + 5000)).toThrow(/expired/);
    expect(redact({ refresh_token: "ya29.secret", ok: "fine" })).toEqual({ refresh_token: "[redacted]", ok: "fine" });
  });

  it("halts new uploads without removing review", () => {
    const { store } = lab();
    setPublishKillSwitch(store, { userId: USER, isAdmin: true }, true, NOW);
    expect(store.data.killSwitch.global).toBe(true);
    expect(store.data.audits.some((event) => event.action === "publish.halt")).toBe(true);
  });
});
