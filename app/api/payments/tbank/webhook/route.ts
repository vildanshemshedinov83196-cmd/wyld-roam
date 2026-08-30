import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  issueEsimForOrder,
} from "@/lib/esim-issuance";

import {
  verifyTbankToken,
} from "@/lib/tbank";

type TbankWebhook = {
  TerminalKey?: string;
  OrderId?: string;
  Success?: boolean | string;
  Status?: string;
  PaymentId?: string | number;
  ErrorCode?: string;
  Amount?: string | number;
  Token?: string;
};

export async function POST(
  request: Request
) {
  try {
    const rawBody =
      await request.text();

    let payload:
      TbankWebhook;

    try {
      payload =
        JSON.parse(
          rawBody
        ) as TbankWebhook;
    } catch {
      payload =
        Object.fromEntries(
          new URLSearchParams(
            rawBody
          ).entries()
        ) as TbankWebhook;
    }

    /*
     * Проверяем подпись уведомления
     * по схеме T-Bank /v2:
     * параметры + Password → SHA-256.
     */
    if (
      !verifyTbankToken(
        payload as Record<
          string,
          unknown
        >
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
     * Нас интересует только
     * окончательно подтверждённая
     * оплата.
     */
    const status =
      String(
        payload.Status ?? ""
      ).toUpperCase();

    if (
      status !==
      "CONFIRMED"
    ) {
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
    }

    const paymentId =
      String(
        payload.PaymentId ?? ""
      ).trim();

    if (!paymentId) {
      return new Response(
        "Missing PaymentId",
        {
          status: 400,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: payment,
      error: paymentError,
    } = await supabase
      .from("roam_payments")
      .select(
        "id,order_id,status,amount,currency"
      )
      .eq(
        "provider",
        "tbank"
      )
      .eq(
        "provider_payment_id",
        paymentId
      )
      .maybeSingle();

    if (
      paymentError ||
      !payment ||
      !payment.order_id
    ) {
      console.error(
        "T-Bank payment not found:",
        {
          paymentId,
          paymentError,
        }
      );

      return new Response(
        "Payment not found",
        {
          status: 404,
        }
      );
    }

    /*
     * Проверяем OrderId.
     * При Init мы передаём UUID
     * roam_order без дефисов.
     */
    const expectedOrderId =
      String(
        payment.order_id
      ).replace(
        /-/g,
        ""
      );

    const receivedOrderId =
      String(
        payload.OrderId ?? ""
      );

    if (
      receivedOrderId !==
      expectedOrderId
    ) {
      console.error(
        "T-Bank order mismatch:",
        {
          receivedOrderId,
          expectedOrderId,
        }
      );

      return new Response(
        "Order mismatch",
        {
          status: 400,
        }
      );
    }

    /*
     * В webhook Т-Банка Amount
     * приходит в копейках.
     *
     * В roam_payments мы храним
     * сумму СБП в рублях.
     */
    const webhookKopecks =
      Number(
        payload.Amount
      );

    const expectedRub =
      Number(
        payment.amount
      );

    if (
      !Number.isFinite(
        webhookKopecks
      ) ||
      !Number.isFinite(
        expectedRub
      )
    ) {
      return new Response(
        "Invalid amount",
        {
          status: 400,
        }
      );
    }

    const expectedKopecks =
      Math.round(
        expectedRub *
          100
      );

    if (
      webhookKopecks !==
      expectedKopecks
    ) {
      console.error(
        "T-Bank amount mismatch:",
        {
          webhookKopecks,
          expectedKopecks,
        }
      );

      return new Response(
        "Amount mismatch",
        {
          status: 400,
        }
      );
    }

    if (
      String(
        payment.currency ?? ""
      ).toUpperCase() !==
      "RUB"
    ) {
      console.error(
        "T-Bank currency mismatch"
      );

      return new Response(
        "Currency mismatch",
        {
          status: 400,
        }
      );
    }

    /*
     * Повторный webhook не должен
     * повторно менять состояние.
     */
    if (
      payment.status !==
      "paid"
    ) {
      const {
        error:
          updatePaymentError,
      } = await supabase
        .from("roam_payments")
        .update({
          status:
            "paid",
        })
        .eq(
          "id",
          payment.id
        );

      if (
        updatePaymentError
      ) {
        throw updatePaymentError;
      }

      const {
        error:
          updateOrderError,
      } = await supabase
        .from("roam_orders")
        .update({
          status:
            "paid",
        })
        .eq(
          "id",
          payment.order_id
        )
        .eq(
          "status",
          "pending_payment"
        );

      if (
        updateOrderError
      ) {
        throw updateOrderError;
      }
    }

    /*
     * issueEsimForOrder должен
     * оставаться безопасным при
     * повторном уведомлении.
     */
    try {
      await issueEsimForOrder(
        payment.order_id
      );
    } catch (
      issuanceError
    ) {
      console.error(
        "T-Bank eSIM issuance error:",
        issuanceError
      );

      /*
       * Оплата уже подтверждена.
       * Не заставляем Т-Банк
       * повторять webhook бесконечно.
       */
    }

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
      "Webhook error",
      {
        status: 500,
      }
    );
  }
}
