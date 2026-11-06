import { listSessions } from "@clipppy/domain";
import { jsonError, requireApiActor, store } from "@/lib/http";

export async function GET() {
  try {
    const session = await requireApiActor();
    return Response.json({ sessions: listSessions(store(), session.actor) });
  } catch (error) {
    return jsonError(error);
  }
}
