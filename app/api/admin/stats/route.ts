import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

async function getSupplierBalance() {
  const accessCode =
    process.env.ESIM_ACCESS_CODE;

  if (!accessCode) {
    return null;
  }

  try {
    const response =
      await fetch(
        "https://api.esimaccess.com/api/v1/open/balance/query",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "RT-AccessCode":
              accessCode,
          },

          body:
            JSON.stringify({}),

          cache:
            "no-store",
        }
      );

    const result =
      await response.json();

    if (
      !response.ok ||
      !result.success
    ) {
      console.error(
        "eSIMAccess balance error:",
        result
      );

      return null;
    }

    return Number(
      result.obj?.balance ?? 0
    );
  } catch (error) {
    console.error(
      "Supplier balance request error:",
      error
    );

    return null;
  }
}

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

    if (
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

    const {
      data: paidOrders,
      error: ordersError,
    } = await supabase
      .from("roam_orders")
      .select(
        `
        id,
        country_code,
        plan_name,
        amount,
        supplier_cost,
        status,
        created_at
        `
      )
      .in(
        "status",
        [
          "paid",
          "ordering_esim",
          "esim_ready",
        ]
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      );

    if (ordersError) {
      throw ordersError;
    }

    const {
      data: starPayments,
      error:
        paymentsError,
    } = await supabase
      .from(
        "roam_payments"
      )
      .select(
        `
        id,
        order_id,
        stars_amount,
        status,
        paid_at,
        created_at
        `
      )
      .eq(
        "provider",
        "telegram_stars"
      )
      .eq(
        "status",
        "paid"
      );

    if (
      paymentsError
    ) {
      throw paymentsError;
    }

    const orders =
      paidOrders ?? [];

    const payments =
      starPayments ?? [];

    const totalSales =
      orders.length;

    const revenue =
      orders.reduce(
        (
          sum,
          order
        ) =>
          sum +
          Number(
            order.amount ?? 0
          ),
        0
      );

    const supplierCost =
      orders.reduce(
        (
          sum,
          order
        ) =>
          sum +
          Number(
            order.supplier_cost ??
              0
          ),
        0
      );

    const profit =
      revenue -
      supplierCost;

    const totalStars =
      payments.reduce(
        (
          sum,
          payment
        ) =>
          sum +
          Number(
            payment.stars_amount ??
              0
          ),
        0
      );

    const now =
      Date.now();

    const oneDay =
      24 *
      60 *
      60 *
      1000;

    function periodStats(
      days: number
    ) {
      const from =
        now -
        days *
          oneDay;

      const filtered =
        orders.filter(
          (
            order
          ) =>
            new Date(
              order.created_at
            ).getTime() >=
            from
        );

      return {
        sales:
          filtered.length,

        revenue:
          filtered.reduce(
            (
              sum,
              order
            ) =>
              sum +
              Number(
                order.amount ??
                  0
              ),
            0
          ),

        profit:
          filtered.reduce(
            (
              sum,
              order
            ) =>
              sum +
              (
                Number(
                  order.amount ??
                    0
                ) -
                Number(
                  order.supplier_cost ??
                    0
                )
              ),
            0
          ),
      };
    }

    const supplierBalance =
      await getSupplierBalance();

    return Response.json({
      success: true,

      stats: {
        totalSales,

        revenue,

        supplierCost,

        profit,

        totalStars,

        supplierBalance,

        today:
          periodStats(
            1
          ),

        sevenDays:
          periodStats(
            7
          ),

        thirtyDays:
          periodStats(
            30
          ),
      },

      recentSales:
        orders
          .slice(
            0,
            15
          )
          .map(
            (
              order
            ) => ({
              id:
                order.id,

              country:
                order.country_code,

              planName:
                order.plan_name,

              amount:
                Number(
                  order.amount ??
                    0
                ),

              supplierCost:
                Number(
                  order.supplier_cost ??
                    0
                ),

              profit:
                Number(
                  order.amount ??
                    0
                ) -
                Number(
                  order.supplier_cost ??
                    0
                ),

              status:
                order.status,

              createdAt:
                order.created_at,
            })
          ),
    });
  } catch (error) {
    console.error(
      "Admin stats error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to load admin stats",
      },
      {
        status: 500,
      }
    );
  }
}
