import { createRenderVersion } from "@clipppy/domain";
import { assertSameOrigin, jsonError, requireApiActor, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const session = await requireApiActor();
    const { id } = await context.params;
    const render = createRenderVersion(store(), { actor: session.actor, candidateId: id, now: new Date() });
    return Response.json({ render_id: render.id, version: render.version, state: "rendering" });
  } catch (error) {
    return jsonError(error);
  }
}
