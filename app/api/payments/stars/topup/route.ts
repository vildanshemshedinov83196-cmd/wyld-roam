import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

function usdToStars(
  amount: number
) {
  const stars =
    Math.round(
      (amount / 3) *
        100
    );

  return Math.max(
    stars,
    1
  );
}

async function createInvoice(
  params: {
    title: string;
    description: string;
    payload: string;
    starsAmount: number;
  }
) {
  const token =
    process.env
      .TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not configured"
    );
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${token}/createInvoiceLink`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            title:
              params.title,

            description:
              params.description,

            payload:
              params.payload,

            currency:
              "XTR",

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
    !result?.ok ||
    !result?.result
  ) {
    console.error(
      "Telegram Top Up invoice error:",
      result
    );

    throw new Error(
      result?.description ||
        "Не удалось создать счёт Stars"
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
        { status: 401 }
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
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const topupId =
      String(
        body?.topupId ?? ""
      ).trim();

    if (!topupId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "topupId is required",
        },
        { status: 400 }
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
            "User not found",
        },
        { status: 404 }
      );
    }

    const {
      data: topup,
      error: topupError,
    } = await supabase
      .from("roam_topups")
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
      .eq("id", topupId)
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      topupError ||
      !topup
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Top Up not found",
        },
        { status: 404 }
      );
    }

    if (
      topup.status !==
      "pending_payment"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Этот Top Up уже нельзя оплатить",
        },
        { status: 409 }
      );
    }

    const amount =
      Number(
        topup.amount
      );

    const starsAmount =
      usdToStars(
        amount
      );

    /*
     * Ищем уже созданный pending payment.
     * Если пользователь нажал дважды,
     * не плодим записи без необходимости.
     */
    let {
      data: payment,
    } = await supabase
      .from("roam_payments")
      .select(
        "id,stars_amount"
      )
      .eq(
        "topup_id",
        topup.id
      )
      .eq(
        "provider",
        "telegram_stars"
      )
      .eq(
        "status",
        "pending"
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (!payment) {
      const {
        data:
          newPayment,

        error:
          paymentError,
      } = await supabase
        .from("roam_payments")
        .insert({
          order_id:
            null,

          topup_id:
            topup.id,

          provider:
            "telegram_stars",

          amount:
            amount,

          currency:
            "USD",

          stars_amount:
            starsAmount,

          status:
            "pending",
        })
        .select(
          "id,stars_amount"
        )
        .single();

      if (
        paymentError ||
        !newPayment
      ) {
        console.error(
          "Top Up payment insert error:",
          paymentError
        );

        throw new Error(
          "Could not create payment"
        );
      }

      payment =
        newPayment;
    }

    const actualStars =
      Number(
        payment.stars_amount
      );

    const invoiceUrl =
      await createInvoice({
        title:
          `Top Up ${topup.data_label}`,

        description:
          `${topup.plan_name} · WYLD ROAM`,

        payload:
          `wyld_roam_topup:${topup.id}`,

        starsAmount:
          actualStars,
      });

    await supabase
      .from("roam_topups")
      .update({
        stars_amount:
          actualStars,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        topup.id
      );

    return NextResponse.json({
      success: true,
      invoiceUrl,
      starsAmount:
        actualStars,
    });
  } catch (error) {
    console.error(
      "Top Up Stars create error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
