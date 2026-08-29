import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  issueEsimForOrder,
} from "@/lib/esim-issuance";

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
      await request.json();

    const orderId =
      String(
        body?.orderId ??
          ""
      ).trim();

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

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
      error: userError,
    } = await supabase
      .from("roam_users")
      .select("id, role")
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (
      userError ||
      !user
    ) {
      return Response.json(
        {
          success: false,
          error:
            "User not found",
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
        "id, user_id"
      )
      .eq(
        "id",
        orderId
      )
      .maybeSingle();

    if (
      orderError ||
      !order
    ) {
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
      order.user_id !==
        user.id &&
      user.role !==
        "owner"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    const result =
      await issueEsimForOrder(
        orderId,
        {
          waitForProfile:
            true,
        }
      );

    return Response.json(
      result
    );
  } catch (error) {
    console.error(
      "eSIM issuance error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to issue eSIM",
      },
      {
        status: 500,
      }
    );
  }
}
