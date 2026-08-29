import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";
import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";
import {
  issueEsimForOrder,
} from "@/lib/esim-issuance";

export const runtime = "nodejs";

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const initData =
      String(
        body?.initData ?? ""
      ).trim();

    if (!initData) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing Telegram initData",
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
      return Response.json(
        {
          ok: false,
          error:
            "Invalid Telegram initData",
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
      error: userError,
    } =
      await supabase
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
      return Response.json(
        {
          ok: false,
          error:
            "WYLD ROAM user not found",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: orders,
      error: ordersError,
    } =
      await supabase
        .from("roam_orders")
        .select(
          "id, status, created_at"
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "status",
          [
            "paid",
            "ordering_esim",
          ]
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(10);

    if (ordersError) {
      throw ordersError;
    }

    if (
      !orders ||
      orders.length === 0
    ) {
      return Response.json({
        ok: true,
        recovered: 0,
        pending: 0,
        results: [],
      });
    }

    const results: Array<{
      orderId: string;
      success: boolean;
      ready: boolean;
    }> = [];

    for (
      const order
      of orders
    ) {
      try {
        const result =
          await issueEsimForOrder(
            order.id,
            {
              waitForProfile: false,
            }
          );

        const isReady =
          "ready" in result
            ? Boolean(result.ready)
            : "alreadyReady" in result
              ? Boolean(
                  result.alreadyReady
                )
              : false;

        results.push({
          orderId:
            order.id,
          success: true,
          ready:
            isReady,
        });
      } catch (error) {
        console.error(
          "eSIM recovery error:",
          order.id,
          error
        );

        results.push({
          orderId:
            order.id,
          success: false,
          ready: false,
        });
      }
    }

    return Response.json({
      ok: true,
      recovered:
        results.filter(
          (item) =>
            item.success &&
            item.ready
        ).length,
      pending:
        results.filter(
          (item) =>
            item.success &&
            !item.ready
        ).length,
      results,
    });
  } catch (error) {
    console.error(
      "Recover eSIM route error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          "Failed to recover eSIM orders",
      },
      {
        status: 500,
      }
    );
  }
}
