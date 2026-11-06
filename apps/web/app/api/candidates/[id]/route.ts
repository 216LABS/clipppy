import { getCandidate, loadKeys, signObjectToken } from "@clipppy/domain";
import { jsonError, requireApiActor, store } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiActor();
    const { id } = await context.params;
    const detail = getCandidate(store(), session.actor, id);
    const keys = loadKeys("local");
    const renders = detail.renders.map((render) => ({
      ...render,
      playback: render.objectKey
        ? `/api/media?token=${encodeURIComponent(signObjectToken({ tenantId: session.actor.tenantId, objectKey: render.objectKey, expiresAt: Date.now() + 600_000 }, keys.tokenKey))}`
        : null,
    }));
    return Response.json({ candidate: detail.candidate, renders });
  } catch (error) {
    return jsonError(error);
  }
}
