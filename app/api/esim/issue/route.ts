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
    /*
     * Авторизация через Telegram.
     * Никакого публичного выпуска eSIM
     * только по одному orderId.
     */
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
     * Находим пользователя Telegram.
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
     * Получаем заказ.
     *
     * ВАЖНО:
     * supplier_cost остаётся
     * исключительно на сервере.
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
     * Клиент может работать
     * только со своим заказом.
     *
     * Owner оставляем возможность
     * проводить контролируемые тесты.
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
     * Проверяем, что Stars
     * действительно были оплачены.
     *
     * Не доверяем одному только
     * status заказа.
     */
    const {
      data: payment,
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
      .maybeSingle();

    if (paymentError) {
      throw paymentError;
    }

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
     * Если eSIM для заказа уже существует,
     * второй экземпляр создавать нельзя.
     */
    const {
      data: existingEsim,
      error: esimError,
    } = await supabase
      .from("roam_esims")
      .select(
        `
        id,
        supplier_order_id,
        status
        `
      )
      .eq(
        "order_id",
        order.id
      )
      .maybeSingle();

    if (esimError) {
      throw esimError;
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
        },
      });
    }

    /*
     * На данном этапе намеренно
     * НЕ вызываем eSIMAccess.
     *
     * Это dry-run проверка всей
     * цепочки безопасности.
     */
    return Response.json({
      success: true,

      dryRun: true,

      readyToIssue: true,

      order: {
        id:
          order.id,

        status:
          order.status,

        packageCode:
          order.package_code,

        countryCode:
          order.country_code,
      },

      payment: {
        confirmed: true,

        provider:
          payment.provider,

        starsAmount:
          Number(
            payment.stars_amount ??
              0
          ),
      },

      message:
        "Order is verified and ready for eSIM issuance",
    });
  } catch (error) {
    console.error(
      "eSIM issue preparation error:",
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
