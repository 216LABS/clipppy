import { rejectRequestSchema } from "@clipppy/contracts";
import { rejectCandidate } from "@clipppy/domain";
import { assertSameOrigin, jsonError, requireApiActor, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const session = await requireApiActor();
    const { id } = await context.params;
    const body = rejectRequestSchema.parse(await request.json());
    rejectCandidate(store(), { actor: session.actor, candidateId: id, reason: body.reason_code, note: body.note, now: new Date() });
    return Response.json({ state: "rejected" });
  } catch (error) {
    return jsonError(error);
  }
}
