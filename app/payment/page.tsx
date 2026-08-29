"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  getTelegramInitData,
  getTelegramWebApp,
} from "@/lib/telegram-client";

type Order = {
  id: string;
  status: string;
  packageCode: string;
  country: string;
  planName: string;
  data: string;
  duration: number | null;
  durationUnit: string | null;
  amount: number;
  currency: string;
  createdAt: string;
};

function statusLabel(
  status: string
) {
  switch (status) {
    case "pending_payment":
      return "Ожидает оплаты";

    case "paid":
      return "Оплачено";

    case "ordering_esim":
      return "Выпускаем eSIM";

    case "esim_ready":
      return "eSIM готова";

    case "failed":
      return "Ошибка";

    case "refunded":
      return "Возврат";

    case "cancelled":
      return "Отменён";

    default:
      return status;
  }
}

function durationLabel(
  duration: number | null,
  unit: string | null
) {
  if (!duration) {
    return "—";
  }

  if (
    unit === "DAY" ||
    unit === "day" ||
    unit === "days"
  ) {
    if (
      duration % 10 === 1 &&
      duration % 100 !== 11
    ) {
      return `${duration} день`;
    }

    if (
      duration % 10 >= 2 &&
      duration % 10 <= 4 &&
      !(
        duration % 100 >= 12 &&
        duration % 100 <= 14
      )
    ) {
      return `${duration} дня`;
    }

    return `${duration} дней`;
  }

  return `${duration} ${unit ?? ""}`;
}

function PaymentContent() {
  const searchParams =
    useSearchParams();

  const orderId =
    searchParams.get(
      "order"
    ) ?? "";

  const [
    order,
    setOrder,
  ] = useState<Order | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    paying,
    setPaying,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    starsAmount,
    setStarsAmount,
  ] = useState<
    number | null
  >(null);

  useEffect(() => {
    const webApp =
      getTelegramWebApp();

    if (webApp) {
      webApp.ready();
      webApp.expand();
    }
  }, []);

  useEffect(() => {
    if (!orderId) {
      setError(
        "Заказ не найден"
      );
      setLoading(false);
      return;
    }

    async function loadOrder() {
      try {
        const response =
          await fetch(
            `/api/orders/${encodeURIComponent(
              orderId
            )}`,
            {
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
          throw new Error(
            result.error ??
              "Не удалось загрузить заказ"
          );
        }

        setOrder(
          result.order
        );
      } catch (err) {
        console.error(
          "Load order error:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Не удалось загрузить заказ"
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [orderId]);

  async function payWithStars() {
    if (
      !order ||
      paying
    ) {
      return;
    }

    const webApp =
      getTelegramWebApp();

    const initData =
      getTelegramInitData();

    if (
      !webApp ||
      !initData
    ) {
      setError(
        "Оплата Stars доступна только внутри Telegram."
      );
      return;
    }

    setPaying(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/payments/stars/create",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-telegram-init-data":
                initData,
            },

            body:
              JSON.stringify({
                orderId:
                  order.id,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success ||
        !result.invoiceUrl
      ) {
        throw new Error(
          result.error ??
            "Не удалось создать оплату"
        );
      }

      setStarsAmount(
        result.starsAmount
      );

      /*
       * Telegram WebApp SDK.
       * Открываем invoice прямо
       * внутри Mini App.
       */
      const openInvoice =
        (
          webApp as unknown as {
            openInvoice?: (
              url: string,
              callback?: (
                status: string
              ) => void
            ) => void;
          }
        ).openInvoice;

      if (!openInvoice) {
        throw new Error(
          "Telegram invoice API недоступен"
        );
      }

      openInvoice(
        result.invoiceUrl,
        async (
          status
        ) => {
          /*
           * status может быть:
           * paid
           * cancelled
           * failed
           * pending
           */
          if (
            status ===
            "paid"
          ) {
            /*
             * successful_payment
             * всё равно приходит
             * через webhook.
             *
             * Здесь просто ждём
             * и перечитываем заказ.
             */
            await waitForPaid();
          }

          if (
            status ===
              "cancelled" ||
            status ===
              "failed"
          ) {
            setPaying(false);
          }
        }
      );
    } catch (err) {
      console.error(
        "Stars payment error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка оплаты"
      );

      setPaying(false);
    }
  }

  async function waitForPaid() {
    const maxAttempts =
      20;

    for (
      let attempt = 0;
      attempt <
      maxAttempts;
      attempt++
    ) {
      await new Promise(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            1500
          )
      );

      try {
        const response =
          await fetch(
            `/api/orders/${encodeURIComponent(
              orderId
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          await response.json();

        if (
          result.success &&
          result.order
        ) {
          setOrder(
            result.order
          );

          if (
            result.order
              .status !==
            "pending_payment"
          ) {
            setPaying(
              false
            );
            return;
          }
        }
      } catch (error) {
        console.error(
          "Payment polling error:",
          error
        );
      }
    }

    setPaying(false);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-sm text-white/40">
        Загружаем заказ...
      </main>
    );
  }

  if (
    error &&
    !order
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="max-w-sm text-center">
          <div className="text-2xl font-semibold">
            Не удалось открыть
            заказ
          </div>

          <div className="mt-4 text-sm leading-6 text-white/40">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!order) {
    return null;
  }

  const isPending =
    order.status ===
    "pending_payment";

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/35">
            WYLD ROAM
          </div>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Оплата
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/40">
            Заказ создан и
            сохранён
          </p>
        </header>

        <section className="mt-8 rounded-[30px] border border-white/10 bg-white/[0.05] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/30">
                Статус
              </div>

              <div className="mt-2 text-lg font-semibold">
                {statusLabel(
                  order.status
                )}
              </div>
            </div>

            <div
              className={
                isPending
                  ? "rounded-full bg-white/10 px-3 py-2 text-xs text-white/70"
                  : "rounded-full bg-white px-3 py-2 text-xs font-semibold text-black"
              }
            >
              {order.status}
            </div>
          </div>

          <div className="my-6 h-px bg-white/10" />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/30">
                Страна
              </div>

              <div className="mt-2 text-xl font-semibold">
                {
                  order.country
                }
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/30">
                Интернет
              </div>

              <div className="mt-2 text-xl font-semibold">
                {order.data}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/30">
                Срок
              </div>

              <div className="mt-2 font-semibold">
                {durationLabel(
                  order.duration,
                  order.durationUnit
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/30">
                Стоимость
              </div>

              <div className="mt-2 font-semibold">
                $
                {Number(
                  order.amount
                ).toFixed(
                  2
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs text-white/30">
              Тариф
            </div>

            <div className="mt-2 text-base font-medium">
              {
                order.planName
              }
            </div>
          </div>

          <div className="mt-6">
            <div className="text-xs text-white/30">
              ID заказа
            </div>

            <div className="mt-2 break-all text-xs leading-5 text-white/45">
              {order.id}
            </div>
          </div>
        </section>

        {isPending ? (
          <>
            <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
              <div className="text-sm font-semibold">
                Способ оплаты
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/[0.05] p-4">
                <div>
                  <div className="font-semibold">
                    Telegram Stars
                  </div>

                  <div className="mt-1 text-xs text-white/35">
                    Оплата внутри
                    Telegram
                  </div>
                </div>

                <div className="text-2xl">
                  ⭐
                </div>
              </div>
            </section>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={
                payWithStars
              }
              disabled={
                paying
              }
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paying
                ? "Ожидаем оплату..."
                : starsAmount
                  ? `Оплатить · ${starsAmount} ⭐`
                  : "Оплатить ⭐"}
            </button>

            <p className="mt-4 px-5 text-center text-[11px] leading-5 text-white/25">
              eSIM будет выпущена
              только после
              подтверждения платежа
              Telegram.
            </p>
          </>
        ) : (
          <section className="mt-5 rounded-[30px] border border-white/10 bg-white p-6 text-black">
            <div className="text-xl font-semibold">
              Оплата подтверждена
            </div>

            <p className="mt-3 text-sm leading-6 text-black/60">
              Заказ оплачен.
              Следующим этапом
              WYLD ROAM выпустит
              вашу eSIM.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#050505] text-sm text-white/40">
          Загружаем...
        </main>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
