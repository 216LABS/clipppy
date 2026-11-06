import { ClipppyError, type AppEnv } from "@clipppy/contracts";
import { executePublish, type Publisher } from "@clipppy/publish";
import { accessFor } from "./access";
import { latestRender } from "./approval";
import type { MemoryStore } from "./store";

export async function runPublication(
  store: MemoryStore,
  publicationId: string,
  adapter: Publisher,
  appEnv: AppEnv,
): Promise<{ providerPostId: string; duplicate: boolean }> {
  const publication = store.data.publications.find((item) => item.id === publicationId);
  if (!publication) throw new ClipppyError("PUBLICATION_NOT_FOUND", "Publication was not found.", 404);
  const approval = store.data.approvals.find((item) => item.id === publication.approvalId && item.tenantId === publication.tenantId);
  const render = approval ? store.data.renders.find((item) => item.id === approval.renderId && item.tenantId === approval.tenantId) : undefined;
  const destination = store.data.destinations.find((item) => item.id === publication.destinationId);
  const candidate = approval ? store.data.candidates.find((item) => item.id === approval.candidateId) : undefined;
  const entitlement = store.data.entitlements.find((item) => item.tenantId === publication.tenantId);
  if (!destination || !candidate || !entitlement) {
    throw new ClipppyError("PUBLISH_CONTEXT_INCOMPLETE", "Publish context is incomplete.", 409);
  }
  const latest = latestRender(store, candidate.id);
  if (approval && latest && render && latest.id !== render.id) {
    publication.status = "cancelled";
    publication.lastErrorCode = "STALE_APPROVAL";
    publication.retryable = false;
    throw new ClipppyError("STALE_APPROVAL", "A newer render replaced the approved cut.", 409);
  }
  const result = await executePublish({
    appEnv,
    adapter,
    candidateState: candidate.state,
    approval: approval
      ? {
          id: approval.id,
          renderId: approval.renderId,
          renderChecksum: approval.renderChecksum,
          tenantId: approval.tenantId,
          title: approval.title,
          description: approval.description,
          tags: approval.tags,
        }
      : null,
    render: render
      ? {
          id: render.id,
          checksumSha256: render.checksumSha256,
          tenantId: render.tenantId,
          objectKey: render.objectKey,
        }
      : null,
    publication: {
      id: publication.id,
      status: publication.status,
      providerPostId: publication.providerPostId,
      idempotencyKey: publication.idempotencyKey,
      destinationId: publication.destinationId,
    },
    destination: {
      id: destination.id,
      platform: destination.platform,
      tenantId: destination.tenantId,
      status: destination.status,
      appVisibility: destination.appVisibility,
      allowedVisibility: destination.allowedVisibility,
    },
    entitlementAllowsPublish: accessFor(entitlement, new Date()).publish,
    killSwitch: store.data.killSwitch.global || store.data.killSwitch.destinations[destination.id] === true,
    requestedVisibility: publication.requestedVisibility,
  });
  if (!result.duplicate) {
    publication.providerPostId = result.providerPostId;
    publication.attempts += 1;
    publication.status = "published";
    const siblings = store.data.publications.filter((item) => item.approvalId === publication.approvalId);
    candidate.state = siblings.every((item) => item.status === "published" || item.status === "cancelled") ? "published" : "publishing";
  }
  return result;
}

export function retryPublication(store: MemoryStore, actorTenantId: string, publicationId: string): void {
  const publication = store.data.publications.find((item) => item.id === publicationId);
  if (!publication || publication.tenantId !== actorTenantId) {
    throw new ClipppyError("PUBLICATION_NOT_FOUND", "Publication was not found.", 404);
  }
  if (publication.status !== "failed" || !publication.retryable) {
    throw new ClipppyError("NOT_RETRYABLE", "Only a retryable failure can be requeued, and it keeps the same approval.", 409);
  }
  publication.status = "queued";
  publication.lastErrorCode = null;
}

export function applyProviderWebhook(
  store: MemoryStore,
  event: { id: string; publicationId: string; providerPostId: string; status: "published" | "processing" },
): { duplicate: boolean } {
  if (store.data.providerEvents.includes(event.id)) return { duplicate: true };
  const publication = store.data.publications.find((item) => item.id === event.publicationId);
  if (!publication) throw new ClipppyError("PUBLICATION_NOT_FOUND", "Publication was not found.", 404);
  if (publication.providerPostId && publication.providerPostId !== event.providerPostId) {
    throw new ClipppyError("PROVIDER_ID_CONFLICT", "Provider post id does not match the stored publication.", 409);
  }
  publication.providerPostId = event.providerPostId;
  if (event.status === "published") publication.status = "published";
  store.data.providerEvents.push(event.id);
  return { duplicate: false };
}

export function setPublishKillSwitch(store: MemoryStore, actor: { userId: string; isAdmin: boolean }, halted: boolean, now: Date): void {
  if (!actor.isAdmin) throw new ClipppyError("FORBIDDEN", "Only an admin can halt publishing.", 403);
  store.data.killSwitch.global = halted;
  store.data.audits.push({
    id: store.data.audits.length + 1,
    tenantId: null,
    actorUserId: actor.userId,
    actorType: "admin",
    action: halted ? "publish.halt" : "publish.resume",
    entityType: "kill_switch",
    entityId: "global",
    metadata: {},
    createdAt: now.toISOString(),
  });
}
