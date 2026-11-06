import { ClipppyError } from "@clipppy/contracts";
import type { PublishGateInput, UploadResult } from "./types";

/**
 * The only publish path. Human approval of the exact render checksum is mandatory.
 * APP_ENV other than production cannot reach a live adapter.
 */
export async function executePublish(input: PublishGateInput): Promise<UploadResult & { duplicate: boolean }> {
  if (input.killSwitch) {
    throw new ClipppyError("PUBLISH_HALTED", "The publish kill switch is stopping new uploads. Review stays available.", 409);
  }
  if (!input.entitlementAllowsPublish) {
    throw new ClipppyError("ENTITLEMENT_BLOCKED", "This tenant cannot publish on the current entitlement.", 402);
  }
  if (input.candidateState === "rejected") {
    throw new ClipppyError("REJECTED_NOT_PUBLISHABLE", "A rejected candidate is never uploaded.", 409);
  }
  if (!input.approval) {
    throw new ClipppyError("APPROVAL_REQUIRED", "A person must approve the exact render before upload.", 409);
  }
  if (input.approval.tenantId !== input.destination.tenantId) {
    throw new ClipppyError("TENANT_MISMATCH", "Approval and destination are not in the same tenant.", 403);
  }
  assertChecksum(input);
  if (input.publication.providerPostId) {
    return {
      providerPostId: input.publication.providerPostId,
      status: "uploaded",
      duplicate: true,
    };
  }
  if (input.adapter.mode === "live" && input.appEnv !== "production") {
    throw new ClipppyError(
      "LIVE_POSTING_BLOCKED",
      "APP_ENV is not production, so live social posting is hard-blocked.",
      403,
    );
  }
  if (input.adapter.platform !== input.destination.platform) {
    throw new ClipppyError("DESTINATION_MISMATCH", "Publisher and destination platform differ.", 409);
  }
  if (input.destination.status !== "connected") {
    throw new ClipppyError("DESTINATION_DISCONNECTED", "Reconnect this destination before uploading.", 409);
  }
  const visibility = resolveVisibility(input);
  assertChecksum(input);
  const uploaded = await input.adapter.upload({
    tenantId: input.approval.tenantId,
    publicationId: input.publication.id,
    idempotencyKey: input.publication.idempotencyKey,
    checksumSha256: input.approval.renderChecksum,
    title: input.approval.title,
    description: input.approval.description,
    tags: input.approval.tags,
    objectKey: input.render?.objectKey ?? "",
    visibility,
    timeoutMs: 30_000,
  });
  return { ...uploaded, duplicate: false };
}

function assertChecksum(input: PublishGateInput): void {
  const render = input.render;
  const approval = input.approval;
  if (!approval || !render?.checksumSha256 || !render.objectKey) {
    throw new ClipppyError("APPROVAL_REQUIRED", "Publish requires an immutable render checksum.", 409);
  }
  if (approval.renderId !== render.id || approval.renderChecksum !== render.checksumSha256) {
    throw new ClipppyError(
      "STALE_APPROVAL",
      "The approved checksum does not match this render. Approve the new cut before posting.",
      409,
    );
  }
  if (render.tenantId !== approval.tenantId) {
    throw new ClipppyError("TENANT_MISMATCH", "Render tenant does not match the approval.", 403);
  }
}

function resolveVisibility(input: PublishGateInput): "public" | "unlisted" | "private" {
  let visibility = input.requestedVisibility;
  if (input.destination.platform === "tiktok" && input.destination.appVisibility === "unaudited") {
    visibility = "private";
  }
  if (!input.destination.allowedVisibility.includes(visibility)) {
    throw new ClipppyError(
      "VISIBILITY_NOT_ALLOWED",
      "That visibility is outside the destination configuration. Privacy is never widened silently.",
      409,
    );
  }
  if (rank(visibility) > rank(input.requestedVisibility) && input.destination.appVisibility !== "unaudited") {
    throw new ClipppyError("VISIBILITY_WIDENED", "Refusing to publish more publicly than requested.", 409);
  }
  return visibility;
}

function rank(visibility: "public" | "unlisted" | "private"): number {
  if (visibility === "private") return 0;
  if (visibility === "unlisted") return 1;
  return 2;
}
