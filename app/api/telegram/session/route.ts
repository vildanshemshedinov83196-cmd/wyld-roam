import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

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
        { status: 401 }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
      error,
    } = await supabase
      .from("roam_users")
      .upsert(
        {
          telegram_user_id:
            telegramUser.id,

          telegram_username:
            telegramUser.username ??
            null,

          first_name:
            telegramUser.first_name ??
            null,

          last_name:
            telegramUser.last_name ??
            null,

          language_code:
            telegramUser.language_code ??
            null,
        },
        {
          onConflict:
            "telegram_user_id",
        }
      )
      .select(
        `
        id,
        telegram_user_id,
        telegram_username,
        first_name,
        last_name,
        language_code
        `
      )
      .single();

    if (error || !user) {
      console.error(
        "Telegram user save error:",
        error
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to save Telegram user",
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,

      user: {
        id: user.id,

        telegramUserId:
          user.telegram_user_id,

        username:
          user.telegram_username,

        firstName:
          user.first_name,

        lastName:
          user.last_name,

        languageCode:
          user.language_code,
      },
    });
  } catch (error) {
    console.error(
      "Telegram session error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to create Telegram session",
      },
      { status: 500 }
    );
  }
}
