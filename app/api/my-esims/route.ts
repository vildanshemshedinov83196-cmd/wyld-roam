import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

export async function GET(
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
        { status: 401 }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
      error: userError,
    } = await supabase
      .from("roam_users")
      .select("id")
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (
      userError ||
      !user
    ) {
      return Response.json({
        success: true,
        esims: [],
      });
    }

    const {
      data: esims,
      error,
    } = await supabase
      .from("roam_esims")
      .select(
        `
        id,
        order_id,
        package_code,
        country_code,
        iccid,
        qr_code,
        activation_code,
        smdp_address,
        status,
        remaining_data_bytes,
        expires_at,
        created_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      console.error(
        "Load eSIM error:",
        error
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to load eSIMs",
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      esims: esims ?? [],
    });
  } catch (error) {
    console.error(
      "My eSIM error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to load eSIMs",
      },
      { status: 500 }
    );
  }
}
