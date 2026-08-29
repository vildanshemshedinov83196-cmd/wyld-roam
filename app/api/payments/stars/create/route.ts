import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

type CreateStarsPaymentBody = {
  orderId?: string;
};

function usdToStars(
  amount: number
) {
  /*
   * Временная внутренняя шкала:
   * $0.99 ≈ 100 Stars.
   *
   * Позже вынесем это
   * в отдельную настройку.
   */
  const stars =
    Math.ceil(
      (amount / 0.99) * 100
    );

  return Math.max(
    stars,
    1
  );
}

export async function POST(
  request: Request
) {
  try {
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      ) ?? "";

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    if (!telegramUser) {
      return Response.json(
        {
          success: false,
          error:
            "Telegram authorization required",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as CreateStarsPaymentBody;

    const orderId =
      body.orderId?.trim();

    if (!orderId) {
      return Response.json(
        {
          success: false,
          error:
            "orderId is required",
        },
        {
          status: 400,
        }
      );
    }

    const botToken =
      process.env
        .TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return Response.json(
        {
          success: false,
          error:
            "Telegram bot is not configured",
        },
        {
          status: 500,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    /*
     * Находим пользователя WYLD ROAM
     * по подтверждённому Telegram ID.
     */
    const {
      data: roamUser,
      error: userError,
    } = await supabase
      .from("roam_users")
      .select(
        "id, telegram_user_id"
      )
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .single();

    if (
      userError ||
      !roamUser
    ) {
      console.error(
        "WYLD ROAM user lookup error:",
        userError
      );

      return Response.json(
        {
          success: false,
          error:
            "WYLD ROAM user not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Получаем только заказ
     * этого Telegram-пользователя.
     */
    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("roam_orders")
      .select(
        `
        id,
        user_id,
        plan_name,
        data_label,
        amount,
        currency,
        status
        `
      )
      .eq(
        "id",
        orderId
      )
      .eq(
        "user_id",
        roamUser.id
      )
      .single();

    if (
      orderError ||
      !order
    ) {
      console.error(
        "Order lookup error:",
        orderError
      );

      return Response.json(
        {
          success: false,
          error:
            "Order not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      order.status !==
      "pending_payment"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Order is not awaiting payment",
        },
        {
          status: 409,
        }
      );
    }

    const amount =
      Number(
        order.amount
      );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Invalid order amount",
        },
        {
          status: 500,
        }
      );
    }

    const starsAmount =
      usdToStars(
        amount
      );

    /*
     * Payload Telegram вернёт нам
     * обратно в платёжных событиях.
     */
    const payload =
      `wyld_roam:${order.id}`;

    /*
     * Создаём Telegram Stars invoice.
     *
     * Для Stars используется XTR.
     * provider_token не нужен.
     */
    const telegramResponse =
      await fetch(
        `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              title:
                order.plan_name ||
                "WYLD ROAM eSIM",

              description:
                `${order.data_label ?? "eSIM"} · WYLD ROAM`,

              payload,

              currency:
                "XTR",

              prices: [
                {
                  label:
                    "WYLD ROAM eSIM",

                  amount:
                    starsAmount,
                },
              ],
            }),
        }
      );

    const telegramData =
      await telegramResponse.json();

    if (
      !telegramResponse.ok ||
      !telegramData.ok ||
      !telegramData.result
    ) {
      console.error(
        "Telegram createInvoiceLink error:",
        telegramData
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to create Telegram Stars invoice",
        },
        {
          status: 502,
        }
      );
    }

    /*
     * Сохраняем pending-платёж.
     */
    const {
      data: payment,
      error:
        paymentError,
    } = await supabase
      .from(
        "roam_payments"
      )
      .insert({
        order_id:
          order.id,

        provider:
          "telegram_stars",

        amount,

        currency:
          "XTR",

        stars_amount:
          starsAmount,

        status:
          "pending",
      })
      .select(
        "id"
      )
      .single();

    if (
      paymentError ||
      !payment
    ) {
      console.error(
        "Create payment error:",
        paymentError
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to save payment",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Клиент получает только:
     * - ID внутреннего платежа
     * - количество Stars
     * - ссылку Telegram invoice
     */
    return Response.json({
      success: true,

      paymentId:
        payment.id,

      starsAmount,

      invoiceUrl:
        telegramData.result,
    });
  } catch (error) {
    console.error(
      "Stars create payment error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to create Stars payment",
      },
      {
        status: 500,
      }
    );
  }
}
