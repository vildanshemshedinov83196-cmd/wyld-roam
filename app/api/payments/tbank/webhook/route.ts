import {
  verifyTbankToken,
} from "@/lib/tbank";

export async function POST(
  request: Request
) {
  try {
    const rawBody =
      await request.text();

    let payload:
      Record<
        string,
        unknown
      >;

    try {
      payload =
        JSON.parse(rawBody);
    } catch {
      /*
       * На случай form-urlencoded
       * уведомления.
       */
      const params =
        new URLSearchParams(
          rawBody
        );

      payload =
        Object.fromEntries(
          params.entries()
        );
    }

    if (
      !verifyTbankToken(
        payload
      )
    ) {
      console.error(
        "Invalid T-Bank webhook token"
      );

      return new Response(
        "Invalid token",
        {
          status: 401,
        }
      );
    }

    /*
     * ВАЖНО:
     * пока это только безопасный
     * тестовый webhook.
     *
     * Не меняем roam_orders.
     * Не меняем roam_payments.
     * Не вызываем eSIMAccess.
     */
    console.log(
      "T-Bank TEST webhook:",
      {
        PaymentId:
          payload.PaymentId ??
          null,

        OrderId:
          payload.OrderId ??
          null,

        Status:
          payload.Status ??
          null,

        Amount:
          payload.Amount ??
          null,

        Success:
          payload.Success ??
          null,
      }
    );

    return new Response(
      "OK",
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",
        },
      }
    );
  } catch (error) {
    console.error(
      "T-Bank webhook error:",
      error
    );

    return new Response(
      "ERROR",
      {
        status: 500,
      }
    );
  }
}
