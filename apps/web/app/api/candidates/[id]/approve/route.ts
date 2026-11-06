import { approveRequestSchema } from "@clipppy/contracts";
import { approveCandidate } from "@clipppy/domain";
import { assertSameOrigin, jsonError, requireApiActor, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const session = await requireApiActor();
    const { id } = await context.params;
    const body = approveRequestSchema.parse(await request.json());
    const result = approveCandidate(store(), {
      actor: session.actor,
      candidateId: id,
      renderId: body.render_id,
      checksum: body.checksum,
      title: body.title,
      description: body.description,
      tags: body.tags,
      destinationIds: body.destination_ids,
      confirmExact: true,
      now: new Date(),
    });
    return Response.json({ approval_id: result.approval.id, publications: result.publications.map((item) => item.id) });
  } catch (error) {
    return jsonError(error);
  }
}
