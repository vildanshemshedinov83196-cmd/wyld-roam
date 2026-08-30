import {
  verifyHeleketWebhook,
} from "@/lib/heleket";

export async function POST(
  request: Request
) {
  try {
    const rawBody =
      await request.text();

    const payload =
      JSON.parse(
        rawBody
      ) as Record<
        string,
        unknown
      >;

    if (
      !verifyHeleketWebhook(
        payload
      )
    ) {
      return new Response(
        "Invalid signature",
        {
          status: 401,
        }
      );
    }

    console.log(
      "Heleket TEST webhook:",
      {
        uuid:
          payload.uuid ??
          null,

        order_id:
          payload.order_id ??
          null,

        status:
          payload.status ??
          null,

        payment_status:
          payload.payment_status ??
          null,
      }
    );

    return new Response(
      "OK",
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Heleket TEST webhook error:",
      error
    );

    return new Response(
      "Webhook error",
      {
        status: 500,
      }
    );
  }
}
