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
  heleketRequest,
} from "@/lib/heleket";

type HeleketInvoiceResponse = {
  state: number;
  result?: {
    uuid?: string;
    order_id?: string;
    url?: string;
    payment_status?: string;
    status?: string;
    expired_at?: number;
  };
  message?: string;
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
      .eq("id", orderId)
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

    const amount =
      Number(order.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
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

    const heleketOrderId =
      `roam_${order.id.replace(
        /-/g,
        ""
      )}`.slice(0, 32);

    const invoice =
      await heleketRequest<
        HeleketInvoiceResponse
      >(
        "/v1/payment",
        {
          amount:
            amount.toFixed(2),

          currency:
            "USD",

          order_id:
            heleketOrderId,

          url_callback:
            "https://wyld-roam.vercel.app/api/payments/heleket/webhook",

          url_return:
            "https://wyld-roam.vercel.app/my-esims",

          url_success:
            "https://wyld-roam.vercel.app/my-esims",

          lifetime:
            3600,

          is_payment_multiple:
            false,

          additional_data:
            order.id,
        }
      );

    if (
      invoice.state !== 0 ||
      !invoice.result?.url ||
      !invoice.result?.uuid
    ) {
      console.error(
        "Heleket invoice error:",
        invoice
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось создать крипто-платёж",
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
          "heleket",

        amount,

        currency:
          "USD",

        status:
          "pending",

        provider_payment_id:
          invoice.result.uuid,
      });

    if (paymentError) {
      console.error(
        "Heleket payment save error:",
        paymentError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Не удалось сохранить платёж",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl:
        invoice.result.url,
      paymentId:
        invoice.result.uuid,
    });
  } catch (error) {
    console.error(
      "Heleket create error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Не удалось создать крипто-платёж",
      },
      {
        status: 500,
      }
    );
  }
}
