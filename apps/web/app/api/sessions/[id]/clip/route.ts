import { clipRequestSchema } from "@clipppy/contracts";
import { advanceFixtureBuffer, createManualCandidate } from "@clipppy/domain";
import { assertSameOrigin, jsonError, requireApiActor, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const session = await requireApiActor();
    const body = clipRequestSchema.parse(await request.json());
    const desk = store();
    advanceFixtureBuffer(desk, id, new Date());
    const created = createManualCandidate(desk, {
      actor: session.actor,
      origin: "dashboard",
      sessionId: id,
      requestId: body.request_id,
      seconds: body.seconds,
      note: body.note,
      clipAnyway: body.clip_anyway,
      now: new Date(),
    });
    return Response.json({ candidate_id: created.candidate.id, state: created.candidate.state, duplicate: created.duplicate }, { status: created.duplicate ? 200 : 202 });
  } catch (error) {
    return jsonError(error);
  }
}
