import { listReview } from "@clipppy/domain";
import { jsonError, requireApiActor, store } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const session = await requireApiActor();
    const state = new URL(request.url).searchParams.get("state");
    const data = store();
    const rows = state === "review" || !state ? listReview(data, session.actor) : data.data.candidates.filter((item) => item.tenantId === session.actor.tenantId && item.state === state);
    return Response.json({ candidates: rows });
  } catch (error) {
    return jsonError(error);
  }
}
