import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { verifyObjectToken, sampleMediaPath } from "@clipppy/domain";
import { jsonError, mediaKey, store } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const claims = verifyObjectToken(token, mediaKey(), Date.now());
    const known = store().data.renders.some((render) => render.tenantId === claims.tenantId && render.objectKey === claims.objectKey);
    if (!known) return Response.json({ error: { code: "NOT_FOUND", message: "Artifact is not in this tenant." } }, { status: 404 });
    const stream = createReadStream(sampleMediaPath());
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "content-type": "video/mp4",
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
