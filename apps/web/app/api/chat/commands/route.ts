import { ingestChatCommand, loadKeys } from "@clipppy/domain";
import { jsonError, store } from "@/lib/http";

export async function POST(request: Request) {
  try {
    if ((process.env.APP_ENV ?? "local") === "production") {
      return Response.json({ error: { code: "NOT_CONFIGURED", message: "Production chat ingest must arrive through the signed provider adapter." } }, { status: 403 });
    }
    if (request.headers.get("x-clipppy-ingest") !== (process.env.CRON_SECRET ?? "local-dev")) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Chat ingest credential was rejected." } }, { status: 401 });
    }
    const body = (await request.json()) as {
      tenantId: string;
      sessionId: string;
      providerEventId: string;
      text: string;
      sender: { providerUserId: string; role: "broadcaster" | "moderator" | "vip" | "subscriber" | "viewer" | "unknown"; isBot: boolean; isSelf: boolean };
      occurredAt: string;
    };
    const result = ingestChatCommand(store(), {
      ...body,
      occurredAt: new Date(body.occurredAt),
      now: new Date(),
      chatKey: loadKeys("local").chatKey,
      auditUserId: "00000000-0000-4000-8000-000000000001",
    });
    return Response.json(result, { status: result.ignored ? 200 : 202 });
  } catch (error) {
    return jsonError(error);
  }
}
