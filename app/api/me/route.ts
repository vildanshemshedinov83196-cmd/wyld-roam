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
          authenticated:
            false,
        },
        {
          status: 401,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
      error,
    } = await supabase
      .from("roam_users")
      .select(
        "id, role"
      )
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (
      error ||
      !user
    ) {
      return Response.json(
        {
          success: false,
          authenticated:
            false,
        },
        {
          status: 404,
        }
      );
    }

    return Response.json({
      success: true,

      authenticated:
        true,

      role:
        user.role,

      isOwner:
        user.role ===
        "owner",
    });
  } catch (error) {
    console.error(
      "GET /api/me error:",
      error
    );

    return Response.json(
      {
        success: false,
      },
      {
        status: 500,
      }
    );
  }
}
