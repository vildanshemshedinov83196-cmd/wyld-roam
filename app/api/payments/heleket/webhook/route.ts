import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  issueEsimForOrder,
} from "@/lib/esim-issuance";

import {
  verifyHeleketWebhook,
} from "@/lib/heleket";

type HeleketWebhook = {
  uuid?: string;
  order_id?: string;
  status?: string;
  payment_status?: string;
  additional_data?: string;
};

export async function POST(
  request: Request
) {
  try {
    const rawBody =
      await request.text();

    const sign =
      request.headers.get(
        "sign"
      );

    if (
      !verifyHeleketWebhook(
        rawBody,
        sign
      )
    ) {
      console.error(
        "Invalid Heleket webhook signature"
      );

      return new Response(
        "Invalid signature",
        {
          status: 401,
        }
      );
    }

    const payload =
      JSON.parse(
        rawBody
      ) as HeleketWebhook;

    const paymentStatus =
      payload.payment_status ??
      payload.status ??
      "";

    /*
     * Нам интересны только
     * полностью оплаченные счета.
     */
    if (
      paymentStatus !==
        "paid" &&
      paymentStatus !==
        "paid_over"
    ) {
      return new Response(
        "OK",
        {
          status: 200,
        }
      );
    }

    const paymentUuid =
      payload.uuid;

    if (!paymentUuid) {
      return new Response(
        "Missing uuid",
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
        "id,order_id,status"
      )
      .eq(
        "provider",
        "heleket"
      )
      .eq(
        "provider_payment_id",
        paymentUuid
      )
      .maybeSingle();

    if (
      paymentError ||
      !payment ||
      !payment.order_id
    ) {
      console.error(
        "Heleket payment not found:",
        paymentError
      );

      return new Response(
        "Payment not found",
        {
          status: 404,
        }
      );
    }

    /*
     * Повторный webhook:
     * второй раз ничего не списываем
     * и новую eSIM не покупаем.
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

      if (updatePaymentError) {
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

      if (updateOrderError) {
        throw updateOrderError;
      }
    }

    const isTestWebhook =
      String(
        payload.order_id ?? ""
      ).startsWith(
        "webhook_test_"
      );

    if (isTestWebhook) {
      console.log(
        "Heleket test paid webhook accepted"
      );

      return new Response(
        "OK",
        {
          status: 200,
        }
      );
    }

    try {
      await issueEsimForOrder(
        payment.order_id
      );
    } catch (
      issuanceError
    ) {
      console.error(
        "Heleket eSIM issuance error:",
        issuanceError
      );

      /*
       * Возвращаем 200, потому что
       * платёж подтверждён.
       * Повторная выдача/recovery
       * должна быть безопасной.
       */
    }

    return new Response(
      "OK",
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "Heleket webhook error:",
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
