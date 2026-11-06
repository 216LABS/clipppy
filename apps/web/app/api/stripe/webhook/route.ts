import { handleStripeEvent, priceAllowlist } from "@clipppy/domain";
import { jsonError, readStripeEvent, store } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const event = await readStripeEvent(request);
    const result = handleStripeEvent(store(), event, priceAllowlist(process.env.STRIPE_PRICE_SEAT_MONTHLY), new Date());
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    return jsonError(error);
  }
}
