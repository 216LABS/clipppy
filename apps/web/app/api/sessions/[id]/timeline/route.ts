import { getTimeline } from "@clipppy/domain";
import { jsonError, requireApiActor, store } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await requireApiActor();
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return Response.json(getTimeline(store(), session.actor, id, from ? Number(from) : undefined, to ? Number(to) : undefined));
  } catch (error) {
    return jsonError(error);
  }
}
