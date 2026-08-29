import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  issueEsimForOrder,
} from "@/lib/esim-issuance";

type TelegramPreCheckoutQuery = {
  id: string;

  from: {
    id: number;
  };

  currency: string;

  total_amount: number;

  invoice_payload: string;
};

type TelegramSuccessfulPayment = {
  currency: string;

  total_amount: number;

  invoice_payload: string;

  telegram_payment_charge_id: string;

  provider_payment_charge_id?: string;
};

type TelegramUpdate = {
  update_id: number;

  pre_checkout_query?:
    TelegramPreCheckoutQuery;

  message?: {
    from?: {
      id: number;
    };

    successful_payment?:
      TelegramSuccessfulPayment;
  };
};

function extractOrderId(
  payload: string
) {
  const prefix =
    "wyld_roam:";

  if (
    !payload.startsWith(
      prefix
    )
  ) {
    return null;
  }

  return payload.slice(
    prefix.length
  );
}

export async function POST(
  request: Request
) {
  try {
    const botToken =
      process.env
        .TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      console.error(
        "TELEGRAM_BOT_TOKEN is missing"
      );

      return Response.json(
        {
          ok: false,
        },
        {
          status: 500,
        }
      );
    }

    const update =
      (await request.json()) as TelegramUpdate;

    /*
     * ======================================================
     * 1. PRE-CHECKOUT QUERY
     * ======================================================
     *
     * Telegram спрашивает нас:
     * можно ли проводить этот платёж.
     */
    if (
      update.pre_checkout_query
    ) {
      const query =
        update.pre_checkout_query;

      const orderId =
        extractOrderId(
          query.invoice_payload
        );

      let ok = false;

      let errorMessage:
        string | undefined;

      if (!orderId) {
        errorMessage =
          "Некорректный заказ.";
      } else if (
        query.currency !==
        "XTR"
      ) {
        errorMessage =
          "Некорректная валюта.";
      } else {
        const supabase =
          getSupabaseAdmin();

        /*
         * Проверяем сам заказ.
         */
        const {
          data: order,
          error:
            orderError,
        } = await supabase
          .from(
            "roam_orders"
          )
          .select(
            `
            id,
            user_id,
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
          errorMessage =
            "Заказ не найден.";
        } else if (
          order.status !==
          "pending_payment"
        ) {
          errorMessage =
            "Этот заказ уже недоступен для оплаты.";
        } else if (
          !order.user_id
        ) {
          errorMessage =
            "Заказ не привязан к Telegram-пользователю.";
        } else {
          /*
           * Проверяем, что заказ
           * принадлежит именно тому
           * Telegram-пользователю,
           * который сейчас платит.
           */
          const {
            data: user,
            error:
              userError,
          } = await supabase
            .from(
              "roam_users"
            )
            .select(
              "telegram_user_id"
            )
            .eq(
              "id",
              order.user_id
            )
            .maybeSingle();

          if (
            userError ||
            !user
          ) {
            errorMessage =
              "Пользователь не найден.";
          } else if (
            Number(
              user.telegram_user_id
            ) !==
            query.from.id
          ) {
            errorMessage =
              "Этот заказ принадлежит другому пользователю.";
          } else {
            /*
             * Дополнительно проверяем
             * ожидаемую сумму Stars.
             */
            const {
              data:
                pendingPayment,
              error:
                pendingPaymentError,
            } = await supabase
              .from(
                "roam_payments"
              )
              .select(
                "stars_amount"
              )
              .eq(
                "order_id",
                orderId
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

            if (
              pendingPaymentError ||
              !pendingPayment
            ) {
              errorMessage =
                "Платёж не найден.";
            } else if (
              Number(
                pendingPayment.stars_amount
              ) !==
              query.total_amount
            ) {
              errorMessage =
                "Сумма платежа изменилась. Создайте заказ заново.";
            } else {
              ok = true;
            }
          }
        }
      }

      /*
       * Telegram ждёт ответ
       * answerPreCheckoutQuery.
       */
      const telegramResponse =
        await fetch(
          `https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                pre_checkout_query_id:
                  query.id,

                ok,

                ...(ok
                  ? {}
                  : {
                      error_message:
                        errorMessage ??
                        "Оплата сейчас недоступна.",
                    }),
              }),
          }
        );

      const telegramResult =
        await telegramResponse.json();

      if (
        !telegramResponse.ok ||
        !telegramResult.ok
      ) {
        console.error(
          "answerPreCheckoutQuery error:",
          telegramResult
        );
      }

      return Response.json({
        ok: true,
      });
    }

    /*
     * ======================================================
     * 2. SUCCESSFUL PAYMENT
     * ======================================================
     *
     * Только здесь считаем,
     * что клиент действительно оплатил.
     */
    const successfulPayment =
      update.message
        ?.successful_payment;

    if (successfulPayment) {
      const orderId =
        extractOrderId(
          successfulPayment.invoice_payload
        );

      if (
        !orderId ||
        successfulPayment.currency !==
          "XTR"
      ) {
        console.error(
          "Invalid successful payment payload"
        );

        return Response.json({
          ok: true,
        });
      }

      const supabase =
        getSupabaseAdmin();

      /*
       * ======================================================
       * 3. ИДЕМПОТЕНТНОСТЬ
       * ======================================================
       *
       * Telegram может повторно
       * прислать тот же update.
       * Повторно оплачивать заказ нельзя.
       */
      const {
        data:
          existingPayment,
        error:
          existingPaymentError,
      } = await supabase
        .from(
          "roam_payments"
        )
        .select(
          "id"
        )
        .eq(
          "provider_payment_id",
          successfulPayment
            .telegram_payment_charge_id
        )
        .maybeSingle();

      if (
        existingPaymentError
      ) {
        console.error(
          "Existing payment lookup error:",
          existingPaymentError
        );
      }

      if (
        existingPayment
      ) {
        return Response.json({
          ok: true,
        });
      }

      /*
       * Находим последний pending
       * Stars-платёж по заказу.
       */
      const {
        data:
          pendingPayment,
        error:
          pendingPaymentError,
      } = await supabase
        .from(
          "roam_payments"
        )
        .select(
          `
          id,
          stars_amount,
          status
          `
        )
        .eq(
          "order_id",
          orderId
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

      if (
        pendingPaymentError ||
        !pendingPayment
      ) {
        console.error(
          "Pending Stars payment not found:",
          pendingPaymentError
        );

        return Response.json({
          ok: true,
        });
      }

      /*
       * Финальная проверка суммы.
       */
      if (
        Number(
          pendingPayment.stars_amount
        ) !==
        successfulPayment.total_amount
      ) {
        console.error(
          "Stars amount mismatch"
        );

        return Response.json({
          ok: true,
        });
      }

      const now =
        new Date().toISOString();

      /*
       * ======================================================
       * 4. СОХРАНЯЕМ ПЛАТЁЖ
       * ======================================================
       */
      const {
        error:
          paymentUpdateError,
      } = await supabase
        .from(
          "roam_payments"
        )
        .update({
          status:
            "paid",

          provider_payment_id:
            successfulPayment
              .telegram_payment_charge_id,

          paid_at:
            now,

          raw_payload:
            successfulPayment,
        })
        .eq(
          "id",
          pendingPayment.id
        )
        .eq(
          "status",
          "pending"
        );

      if (
        paymentUpdateError
      ) {
        console.error(
          "Payment update error:",
          paymentUpdateError
        );

        return Response.json({
          ok: true,
        });
      }

      /*
       * ======================================================
       * 5. ПЕРЕВОДИМ ЗАКАЗ В PAID
       * ======================================================
       *
       * ВАЖНО:
       * eSIMAccess пока НЕ вызываем.
       *
       * На этом этапе мы только
       * подтверждаем оплату.
       */
      const {
        error:
          orderUpdateError,
      } = await supabase
        .from(
          "roam_orders"
        )
        .update({
          status:
            "paid",
        })
        .eq(
          "id",
          orderId
        )
        .eq(
          "status",
          "pending_payment"
        );

      if (
        orderUpdateError
      ) {
        console.error(
          "Order update error:",
          orderUpdateError
        );

        return Response.json({
          ok: true,
        });
      }

      /*
       * ======================================================
       * 6. АВТОМАТИЧЕСКИЙ ВЫПУСК eSIM
       * ======================================================
       *
       * Оплата уже подтверждена Telegram.
       * Здесь создаём заказ у eSIMAccess.
       *
       * Профиль долго не ждём —
       * supplier_order_id сохраняется сразу.
       */
      try {
        const issueResult =
          await issueEsimForOrder(
            orderId,
            {
              waitForProfile: false,
            }
          );

        console.log(
          "Automatic eSIM issuance:",
          issueResult
        );
      } catch (issueError) {
        console.error(
          "Automatic eSIM issuance error:",
          issueError
        );
      }

      return Response.json({
        ok: true,
      });
    }

    /*
     * Остальные Telegram updates
     * пока просто принимаем.
     */
    return Response.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "WYLD ROAM Telegram webhook error:",
      error
    );

    /*
     * Возвращаем Telegram 200,
     * чтобы один повреждённый update
     * не создавал бесконечные повторы.
     */
    return Response.json({
      ok: true,
    });
  }
}

/*
 * Можно открыть URL webhook
 * браузером и проверить,
 * что endpoint существует.
 */
export async function GET() {
  return Response.json({
    ok: true,

    service:
      "WYLD ROAM Telegram webhook",
  });
}
