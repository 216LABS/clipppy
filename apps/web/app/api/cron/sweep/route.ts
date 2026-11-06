import { sweepRetention } from "@clipppy/domain";
import { assertCron, jsonError, store } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertCron(request);
    return Response.json(sweepRetention(store(), new Date()));
  } catch (error) {
    return jsonError(error);
  }
}
