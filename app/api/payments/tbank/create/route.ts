import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  tbankRequest,
} from "@/lib/tbank";

type InitResponse = {
  Success?: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  PaymentId?: string | number;
  Status?: string;
};

type QrResponse = {
  Success?: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Data?: string;
};

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

    /*
     * Курс задаём сами через env.
     * Никакой внешний курс внутри
     * платежа не используется.
     */
    const usdRubRate =
      Number(
        process.env
          .TBANK_USD_RUB_RATE
      );

    if (
      !Number.isFinite(
        usdRubRate
      ) ||
      usdRubRate <= 0
    ) {
      throw new Error(
        "TBANK_USD_RUB_RATE is not configured"
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
    } = await supabase
      .from("roam_users")
      .select("id")
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (!user) {
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
        "id,user_id,status,amount,currency,plan_name,data_label"
      )
      .eq(
        "id",
        orderId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      orderError ||
      !order
    ) {
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

    if (
      String(
        order.currency
      ).toUpperCase() !==
      "USD"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Некорректная валюта заказа",
        },
        {
          status: 400,
        }
      );
    }

    const amountUsd =
      Number(order.amount);

    if (
      !Number.isFinite(
        amountUsd
      ) ||
      amountUsd <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Некорректная сумма заказа",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Т-Банк принимает Amount
     * в копейках.
     */
    const amountKopecks =
      Math.round(
        amountUsd *
          usdRubRate *
          100
      );

    const amountRub =
      amountKopecks /
      100;

    if (amountKopecks < 1000) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Сумма СБП меньше 10 ₽",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * UUID без дефисов:
     * стабильный OrderId длиной
     * 32 символа.
     */
    const tbankOrderId =
      String(order.id).replace(
        /-/g,
        ""
      );

    const init =
      await tbankRequest<
        InitResponse
      >(
        "Init",
        {
          Amount:
            amountKopecks,

          OrderId:
            tbankOrderId,

          Description:
            `WYLD ROAM — ${
              order.plan_name ??
              order.data_label ??
              "eSIM"
            }`,

          NotificationURL:
            "https://wyld-roam.vercel.app/api/payments/tbank/webhook",
        }
      );

    if (
      !init.Success ||
      !init.PaymentId
    ) {
      console.error(
        "T-Bank Init error:",
        init
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось создать СБП-платёж",
        },
        {
          status: 502,
        }
      );
    }

    const paymentId =
      String(
        init.PaymentId
      );

    const qr =
      await tbankRequest<
        QrResponse
      >(
        "GetQr",
        {
          PaymentId:
            paymentId,

          DataType:
            "PAYLOAD",

          PaymentMethod:
            "SBP",
        }
      );

    if (
      !qr.Success ||
      !qr.Data
    ) {
      console.error(
        "T-Bank GetQr error:",
        qr
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось получить QR СБП",
        },
        {
          status: 502,
        }
      );
    }

    const {
      error: paymentError,
    } = await supabase
      .from("roam_payments")
      .insert({
        order_id:
          order.id,

        provider:
          "tbank",

        amount:
          amountRub,

        currency:
          "RUB",

        status:
          "pending",

        provider_payment_id:
          paymentId,
      });

    if (paymentError) {
      console.error(
        "T-Bank payment save error:",
        paymentError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось сохранить СБП-платёж",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      paymentId,

      paymentUrl:
        qr.Data,

      qrData:
        qr.Data,

      amountRub,

      amountUsd,

      usdRubRate,
    });
  } catch (error) {
    console.error(
      "T-Bank create error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Не удалось создать СБП-платёж",
      },
      {
        status: 500,
      }
    );
  }
}
