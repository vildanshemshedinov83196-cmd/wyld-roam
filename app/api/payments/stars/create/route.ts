import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyTelegramInitData } from "@/lib/telegram-auth";

function usdToStars(amount: number) {
  /*
   * Временная логика WYLD ROAM:
   *
   * 100 Stars ≈ $3 для клиента
   * $1 ≈ 33.33 Stars
   *
   * Примеры:
   * $0.99  -> 33 Stars
   * $1.99  -> 66 Stars
   * $2.99  -> 100 Stars
   * $6.99  -> 233 Stars
   * $9.99  -> 333 Stars
   */

  const stars = Math.round(
    (amount / 3) * 100
  );

  return Math.max(
    stars,
    1
  );
}

async function createTelegramInvoiceLink(params: {
  title: string;
  description: string;
  payload: string;
  starsAmount: number;
}) {
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not configured"
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        title: params.title,
        description:
          params.description,

        payload:
          params.payload,

        currency: "XTR",

        prices: [
          {
            label:
              params.title,

            amount:
              params.starsAmount,
          },
        ],
      }),
    }
  );

  const result =
    await response.json();

  if (
    !response.ok ||
    !result.ok ||
    !result.result
  ) {
    console.error(
      "Telegram createInvoiceLink error:",
      result
    );

    throw new Error(
      result.description ??
        "Не удалось создать Telegram Stars invoice"
    );
  }

  return result.result as string;
}

export async function POST(
  request: NextRequest
) {
  try {
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      );

    if (!initData) {
      return NextResponse.json(
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

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    if (!telegramUser) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid Telegram authorization",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const orderId =
      String(
        body?.orderId ?? ""
      ).trim();

    if (!orderId) {
      return NextResponse.json(
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

    const supabase =
      getSupabaseAdmin();

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
      .maybeSingle();

    if (
      userError ||
      !roamUser
    ) {
      console.error(
        "ROAM user lookup error:",
        userError
      );

      return NextResponse.json(
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

const {
  data: order,
  error: orderError,
} = await supabase
  .from("roam_orders")
  .select(
    "id, user_id, status, plan_name, data_label, amount, currency"
  )
      .eq(
        "id",
        orderId
      )
      .eq(
        "user_id",
        roamUser.id
      )
      .maybeSingle();

    if (
      orderError ||
      !order
    ) {
      console.error(
        "ROAM order lookup error:",
        orderError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Заказ не найден",
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
      return NextResponse.json(
        {
          success: false,
          error:
            "Этот заказ уже нельзя оплатить",
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
      return NextResponse.json(
        {
          success: false,
          error:
            "Некорректная стоимость заказа",
        },
        {
          status: 400,
        }
      );
    }

    const starsAmount =
      usdToStars(
        amount
      );

    const payload =
      `wyld_roam:${order.id}`;

    const title =
      String(
        order.plan_name ||
          "WYLD ROAM eSIM"
      ).slice(
        0,
        32
      );

    const description =
      [
        order.data_label
          ? `${order.data_label}`
          : null,

        `WYLD ROAM eSIM`,

        `Заказ ${order.id.slice(
          0,
          8
        )}`,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(
          0,
          255
        );

    const invoiceUrl =
      await createTelegramInvoiceLink(
        {
          title,
          description,
          payload,
          starsAmount,
        }
      );

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
        "ROAM payment insert error:",
        paymentError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось создать запись платежа",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,

        paymentId:
          payment.id,

        starsAmount,

        invoiceUrl,
      }
    );
  } catch (error) {
    console.error(
      "Create Stars payment error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Не удалось создать оплату Stars",
      },
      {
        status: 500,
      }
    );
  }
}
