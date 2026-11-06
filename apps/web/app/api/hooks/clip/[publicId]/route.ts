import { handleClipHook } from "@clipppy/domain";
import { jsonError, mediaKey, store } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await context.params;
  const rawBody = await request.text();
  try {
    const result = handleClipHook(store(), {
      publicId,
      rawBody,
      timestamp: request.headers.get("x-clipppy-timestamp"),
      eventId: request.headers.get("x-clipppy-event-id"),
      signature: request.headers.get("x-clipppy-signature"),
      now: new Date(),
      tokenKey: mediaKey(),
      actorUserId: "00000000-0000-4000-8000-000000000001",
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
