import { ClipppyError, type RejectReason } from "@clipppy/contracts";
import { enqueueJob } from "@clipppy/jobs";
import { assertCapability, requireRole } from "./access";
import { audit, ENGINE_VERSION, type Actor, type Approval, type MemoryStore, type Publication, type RenderArtifact } from "./store";

const PROBE_OK = {
  videoCodec: "h264",
  audioCodec: "aac",
};

export function approveCandidate(
  store: MemoryStore,
  input: {
    actor: Actor;
    candidateId: string;
    renderId: string;
    checksum: string;
    title: string;
    description: string;
    tags: string[];
    destinationIds: string[];
    confirmExact: true;
    now: Date;
    visibility?: "public" | "unlisted" | "private";
  },
): { approval: Approval; publications: Publication[] } {
  if (input.confirmExact !== true) {
    throw new ClipppyError("EXACT_RENDER_REQUIRED", "Confirm the exact render before approval.", 400);
  }
  return store.transaction(() => {
    requireRole(store, input.actor, ["owner", "editor"]);
    const candidate = requireCandidate(store, input.actor.tenantId, input.candidateId);
    if (candidate.state !== "review") {
      throw new ClipppyError("NOT_REVIEWABLE", "Only a candidate in review can be approved.", 409);
    }
    const render = requireRender(store, candidate.tenantId, input.renderId);
    if (render.candidateId !== candidate.id) throw new ClipppyError("RENDER_MISMATCH", "That render is not this candidate.", 409);
    if (render.status !== "succeeded" || !render.checksumSha256 || !render.objectKey) {
      throw new ClipppyError("RENDER_NOT_READY", "The render has no validated artifact yet.", 409);
    }
    if (render.checksumSha256 !== input.checksum) {
      throw new ClipppyError("CHECKSUM_MISMATCH", "The checksum does not match the stored render.", 409);
    }
    const latest = latestRender(store, candidate.id);
    if (!latest || latest.id !== render.id) {
      throw new ClipppyError("STALE_APPROVAL", "A newer render exists. Approve that cut.", 409);
    }
    if (input.title.trim().length === 0 || input.title.length > 100) {
      throw new ClipppyError("TITLE_INVALID", "Title must be 1-100 characters.", 400);
    }
    const destinations = input.destinationIds.map((id) => {
      const destination = store.data.destinations.find((item) => item.id === id);
      if (!destination || destination.tenantId !== candidate.tenantId) {
        throw new ClipppyError("DESTINATION_NOT_FOUND", "Destination is not in this tenant.", 404);
      }
      if (destination.status !== "connected") {
        throw new ClipppyError("DESTINATION_DISCONNECTED", "Reconnect the destination before approving a post.", 409);
      }
      return destination;
    });
    if (destinations.length > 0) assertCapability(store, candidate.tenantId, "publish", input.now);
    const approval: Approval = {
      id: crypto.randomUUID(),
      tenantId: candidate.tenantId,
      candidateId: candidate.id,
      renderId: render.id,
      renderChecksum: render.checksumSha256,
      title: input.title.trim(),
      description: input.description,
      tags: input.tags,
      destinationIds: destinations.map((item) => item.id),
      approvedBy: input.actor.userId,
      createdAt: input.now.toISOString(),
    };
    store.data.approvals.push(approval);
    const publications: Publication[] = destinations.map((destination) => {
      const publication: Publication = {
        id: crypto.randomUUID(),
        tenantId: candidate.tenantId,
        approvalId: approval.id,
        destinationId: destination.id,
        providerPostId: null,
        status: "queued",
        attempts: 0,
        lastErrorCode: null,
        retryable: true,
        idempotencyKey: `publication:${approval.id}:${destination.id}`,
        requestedVisibility: input.visibility ?? (destination.appVisibility === "unaudited" ? "private" : "unlisted"),
        createdAt: input.now.toISOString(),
      };
      store.data.publications.push(publication);
      enqueueJob(store.data.jobs, {
        tenantId: candidate.tenantId,
        kind: destination.platform === "youtube" ? "publish.youtube" : "publish.tiktok",
        payload: { publicationId: publication.id },
        idempotencyKey: publication.idempotencyKey,
        now: input.now,
      });
      return publication;
    });
    candidate.state = destinations.length > 0 ? "approved" : "approved";
    audit(store, {
      tenantId: candidate.tenantId,
      actorUserId: input.actor.userId,
      actorType: "user",
      action: "candidate.approve",
      entityType: "approval",
      entityId: approval.id,
      metadata: { renderId: render.id, checksum: render.checksumSha256, destinations: approval.destinationIds },
      createdAt: input.now.toISOString(),
    });
    return { approval, publications };
  });
}

export function rejectCandidate(
  store: MemoryStore,
  input: { actor: Actor; candidateId: string; reason: RejectReason; note?: string; now: Date },
): void {
  store.transaction(() => {
    requireRole(store, input.actor, ["owner", "editor"]);
    const candidate = requireCandidate(store, input.actor.tenantId, input.candidateId);
    if (candidate.state !== "review" && candidate.state !== "queued" && candidate.state !== "failed") {
      throw new ClipppyError("NOT_REJECTABLE", "This candidate can no longer be rejected.", 409);
    }
    candidate.state = "rejected";
    candidate.reason = { ...candidate.reason, rejectReason: input.reason, rejectNote: input.note ?? "" };
    audit(store, {
      tenantId: candidate.tenantId,
      actorUserId: input.actor.userId,
      actorType: "user",
      action: "candidate.reject",
      entityType: "candidate",
      entityId: candidate.id,
      metadata: { reason: input.reason },
      createdAt: input.now.toISOString(),
    });
  });
}

export function createRenderVersion(
  store: MemoryStore,
  input: { actor: Actor; candidateId: string; now: Date },
): RenderArtifact {
  return store.transaction(() => {
    requireRole(store, input.actor, ["owner", "editor"]);
    assertCapability(store, input.actor.tenantId, "render", input.now);
    const candidate = requireCandidate(store, input.actor.tenantId, input.candidateId);
    const previous = latestRender(store, candidate.id);
    const render: RenderArtifact = {
      id: crypto.randomUUID(),
      tenantId: candidate.tenantId,
      candidateId: candidate.id,
      version: (previous?.version ?? 0) + 1,
      profileVersion: candidate.profileVersion ?? 1,
      timeline: {},
      objectKey: null,
      checksumSha256: null,
      durationMs: null,
      width: null,
      height: null,
      hasAudio: true,
      status: "queued",
      errorCode: null,
      warnings: [],
      engineVersion: ENGINE_VERSION,
      createdAt: input.now.toISOString(),
    };
    store.data.renders.push(render);
    candidate.state = "rendering";
    for (const publication of store.data.publications) {
      if (publication.tenantId !== candidate.tenantId || publication.status === "published") continue;
      const approval = store.data.approvals.find((item) => item.id === publication.approvalId);
      if (approval?.candidateId === candidate.id && publication.status === "queued") {
        publication.status = "cancelled";
        publication.lastErrorCode = "STALE_APPROVAL";
        publication.retryable = false;
      }
    }
    enqueueJob(store.data.jobs, {
      tenantId: candidate.tenantId,
      kind: "clip.render",
      payload: { candidateId: candidate.id, renderId: render.id },
      idempotencyKey: `render:${render.id}`,
      now: input.now,
    });
    return render;
  });
}

export function markRenderReady(
  store: MemoryStore,
  input: {
    tenantId: string;
    renderId: string;
    checksum: string;
    objectKey: string;
    probe: { videoCodec: string; audioCodec: string | null; width: number; height: number; durationMs: number; muted?: boolean };
    warnings?: string[];
    timeline?: Record<string, unknown>;
    now: Date;
  },
): RenderArtifact {
  const render = store.data.renders.find((item) => item.id === input.renderId && item.tenantId === input.tenantId);
  if (!render) throw new ClipppyError("RENDER_NOT_FOUND", "Render was not found for this tenant.", 404);
  if (render.checksumSha256 && render.checksumSha256 !== input.checksum) {
    throw new ClipppyError("CHECKSUM_IMMUTABLE", "A render checksum cannot be replaced.", 409);
  }
  if (!input.objectKey.startsWith(`tenants/${input.tenantId}/`) || input.objectKey.includes("..")) {
    throw new ClipppyError("UNSAFE_OBJECT_KEY", "Render output key is not tenant scoped.", 400);
  }
  const audioOk = input.probe.muted ? input.probe.audioCodec === null : input.probe.audioCodec === PROBE_OK.audioCodec;
  if (input.probe.videoCodec !== PROBE_OK.videoCodec || !audioOk || input.probe.width < 320 || input.probe.height < 320 || input.probe.durationMs <= 0) {
    render.status = "failed";
    render.errorCode = "RENDER_PROBE_FAILED";
    const candidate = store.data.candidates.find((item) => item.id === render.candidateId);
    if (candidate) candidate.state = "failed";
    throw new ClipppyError("RENDER_PROBE_FAILED", "ffprobe did not accept this artifact.", 422);
  }
  render.checksumSha256 = input.checksum;
  render.objectKey = input.objectKey;
  render.durationMs = input.probe.durationMs;
  render.width = input.probe.width;
  render.height = input.probe.height;
  render.hasAudio = !input.probe.muted;
  render.warnings = input.warnings ?? [];
  render.timeline = input.timeline ?? {};
  render.status = "succeeded";
  const candidate = store.data.candidates.find((item) => item.id === render.candidateId);
  if (candidate && candidate.tenantId === input.tenantId) candidate.state = "review";
  return render;
}

export function latestRender(store: MemoryStore, candidateId: string): RenderArtifact | undefined {
  return store.data.renders
    .filter((item) => item.candidateId === candidateId)
    .sort((a, b) => b.version - a.version)[0];
}

function requireCandidate(store: MemoryStore, tenantId: string, candidateId: string) {
  const candidate = store.data.candidates.find((item) => item.id === candidateId);
  if (!candidate || candidate.tenantId !== tenantId) {
    throw new ClipppyError("CANDIDATE_NOT_FOUND", "Candidate was not found in this tenant.", 404);
  }
  return candidate;
}

function requireRender(store: MemoryStore, tenantId: string, renderId: string) {
  const render = store.data.renders.find((item) => item.id === renderId);
  if (!render || render.tenantId !== tenantId) {
    throw new ClipppyError("RENDER_NOT_FOUND", "Render was not found in this tenant.", 404);
  }
  return render;
}
