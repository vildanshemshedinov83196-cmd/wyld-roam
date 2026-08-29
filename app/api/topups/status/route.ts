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
  topupEsimForOrder,
} from "@/lib/topup-issuance";

export const runtime =
  "nodejs";

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

    let {
      data: topup,
      error: topupError,
    } = await supabase
      .from("roam_topups")
      .select(
        `
        id,
        user_id,
        status,
        data_label,
        plan_name,
        amount,
        stars_amount,
        completed_at,
        last_error
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

    /*
     * Если Stars уже оплачены,
     * но webhook умер ДО вызова
     * поставщика, безопасно
     * запускаем обработку.
     *
     * processing автоматически
     * повторно НЕ отправляем.
     */
    if (
      topup.status ===
      "paid"
    ) {
      try {
        await topupEsimForOrder(
          topup.id
        );
      } catch (error) {
        console.error(
          "Top Up recovery error:",
          error
        );
      }

      const refreshed =
        await supabase
          .from("roam_topups")
          .select(
            `
            id,
            user_id,
            status,
            data_label,
            plan_name,
            amount,
            stars_amount,
            completed_at,
            last_error
            `
          )
          .eq(
            "id",
            topup.id
          )
          .maybeSingle();

      if (
        refreshed.data
      ) {
        topup =
          refreshed.data;
      }
    }

    return NextResponse.json({
      success: true,
      topup,
    });
  } catch (error) {
    console.error(
      "Top Up status error:",
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
