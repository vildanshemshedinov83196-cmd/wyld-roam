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

    /*
     * ============================================
     * USER
     * ============================================
     */

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

    /*
     * ============================================
     * ORDER
     * ============================================
     */

    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("roam_orders")
      .select(
        `
        id,
        user_id,
        package_code,
        country_code,
        supplier_cost,
        amount,
        status
        `
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

    /*
     * Клиент может выпускать
     * только свою eSIM.
     *
     * Owner может проводить
     * контролируемые тесты.
     */

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

    /*
     * ============================================
     * PAYMENT
     * ============================================
     *
     * Проверяем не просто status заказа,
     * а настоящий paid Stars payment.
     */

    const {
      data: payments,
      error: paymentError,
    } = await supabase
      .from("roam_payments")
      .select(
        `
        id,
        provider,
        status,
        stars_amount
        `
      )
      .eq(
        "order_id",
        order.id
      )
      .eq(
        "provider",
        "telegram_stars"
      )
      .eq(
        "status",
        "paid"
      )
      .limit(1);

    if (paymentError) {
      throw paymentError;
    }

    const payment =
      payments?.[0];

    if (!payment) {
      return Response.json(
        {
          success: false,
          error:
            "Paid Telegram Stars payment not found",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================
     * EXISTING ESIM
     * ============================================
     */

    const {
      data: existingEsim,
      error: existingEsimError,
    } = await supabase
      .from("roam_esims")
      .select(
        `
        id,
        supplier_order_id,
        iccid,
        status
        `
      )
      .eq(
        "order_id",
        order.id
      )
      .maybeSingle();

    if (existingEsimError) {
      throw existingEsimError;
    }

    if (existingEsim) {
      return Response.json({
        success: true,
        alreadyExists: true,

        esim: {
          id:
            existingEsim.id,

          status:
            existingEsim.status,

          hasSupplierOrder:
            Boolean(
              existingEsim
                .supplier_order_id
            ),

          hasIccid:
            Boolean(
              existingEsim.iccid
            ),
        },
      });
    }

    /*
     * ============================================
     * ORDER STATUS
     * ============================================
     */

    if (
      order.status !==
      "paid"
    ) {
      return Response.json(
        {
          success: false,
          error:
            `Order cannot be issued from status: ${order.status}`,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================
     * ATOMIC CLAIM
     * ============================================
     *
     * Самый важный участок.
     *
     * Меняем:
     *
     * paid -> ordering_esim
     *
     * НО только если статус всё ещё paid.
     *
     * Если два запроса придут одновременно,
     * только один сможет получить claimedOrder.
     */

    const {
      data: claimedOrder,
      error: claimError,
    } = await supabase
      .from("roam_orders")
      .update({
        status:
          "ordering_esim",
      })
      .eq(
        "id",
        order.id
      )
      .eq(
        "status",
        "paid"
      )
      .select(
        `
        id,
        user_id,
        package_code,
        country_code,
        supplier_cost,
        amount,
        status
        `
      )
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    /*
     * Если строка не вернулась,
     * другой запрос уже забрал заказ.
     */

    if (!claimedOrder) {
      return Response.json(
        {
          success: false,
          alreadyClaimed: true,
          error:
            "Order is already being processed",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================
     * RESERVATION ROW
     * ============================================
     *
     * Создаём roam_esims ДО обращения
     * к поставщику.
     *
     * order_id UNIQUE даёт нам
     * ещё один уровень защиты.
     */

    const {
      data: reservedEsim,
      error: reserveError,
    } = await supabase
      .from("roam_esims")
      .insert({
        order_id:
          claimedOrder.id,

        user_id:
          claimedOrder.user_id,

        package_code:
          claimedOrder.package_code,

        country_code:
          claimedOrder.country_code,

        status:
          "pending",
      })
      .select(
        "id, status"
      )
      .single();

    if (reserveError) {
      /*
       * Мы ещё НЕ обращались
       * к eSIMAccess.
       *
       * Поэтому заказ можно
       * безопасно вернуть в paid.
       */

      await supabase
        .from("roam_orders")
        .update({
          status:
            "paid",
        })
        .eq(
          "id",
          claimedOrder.id
        )
        .eq(
          "status",
          "ordering_esim"
        );

      throw reserveError;
    }

    /*
     * ============================================
     * STOP BEFORE REAL PURCHASE
     * ============================================
     *
     * Пока намеренно НЕ вызываем orderEsim().
     *
     * Проверяем, что атомарная защита
     * работает и проект собирается.
     *
     * ВАЖНО:
     * Не вызывай этот endpoint вручную
     * на реальном paid-заказе на данном
     * этапе, потому что он изменит статус
     * заказа на ordering_esim.
     */

    return Response.json({
      success: true,

      protectedDryRun: true,

      message:
        "Order safely claimed for eSIM issuance",

      order: {
        id:
          claimedOrder.id,

        status:
          claimedOrder.status,

        packageCode:
          claimedOrder.package_code,

        countryCode:
          claimedOrder.country_code,
      },

      esim: {
        id:
          reservedEsim.id,

        status:
          reservedEsim.status,
      },

      payment: {
        confirmed: true,

        starsAmount:
          Number(
            payment.stars_amount ??
              0
          ),
      },
    });
  } catch (error) {
    console.error(
      "Protected eSIM issue error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to prepare eSIM issuance",
      },
      {
        status: 500,
      }
    );
  }
}
