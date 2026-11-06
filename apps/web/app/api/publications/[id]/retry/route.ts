import { retryPublication } from "@clipppy/domain";
import { assertSameOrigin, jsonError, requireApiActor, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const session = await requireApiActor();
    const { id } = await context.params;
    retryPublication(store(), session.actor.tenantId, id);
    return Response.json({ state: "queued" });
  } catch (error) {
    return jsonError(error);
  }
}
