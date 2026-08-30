"use client";

import Link from "next/link";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import {
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

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
    [
      "DAY",
      "day",
      "days",
    ].includes(
      unit ?? ""
    )
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
    cryptoPaying,
    setCryptoPaying,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

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

  async function waitForPaid() {
    for (
      let attempt = 0;
      attempt < 20;
      attempt++
    ) {
      await new Promise(
        (resolve) =>
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
            result.order.status !==
            "pending_payment"
          ) {
            setPaying(false);
            return;
          }
        }
      } catch (pollError) {
        console.error(
          "Payment polling error:",
          pollError
        );
      }
    }

    setPaying(false);
  }

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
            method: "POST",

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
        async (status) => {
          if (
            status === "paid"
          ) {
            await waitForPaid();
          }

          if (
            status ===
              "cancelled" ||
            status === "failed"
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

  async function payWithCrypto() {
    if (
      !order ||
      paying ||
      cryptoPaying
    ) {
      return;
    }

    const initData =
      getTelegramInitData();

    if (!initData) {
      setError(
        "Криптооплата доступна внутри Telegram."
      );
      return;
    }

    setCryptoPaying(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/payments/heleket/create",
          {
            method: "POST",

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
        !result.paymentUrl
      ) {
        throw new Error(
          result.error ??
            "Не удалось создать крипто-платёж"
        );
      }

      const webApp =
        getTelegramWebApp();

      if (webApp) {
        const openLink =
          (
            webApp as unknown as {
              openLink?: (
                url: string
              ) => void;
            }
          ).openLink;

        if (openLink) {
          openLink(
            result.paymentUrl
          );

          setCryptoPaying(
            false
          );

          return;
        }
      }

      window.location.href =
        result.paymentUrl;
    } catch (err) {
      console.error(
        "Crypto payment error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Ошибка криптооплаты"
      );

      setCryptoPaying(false);
    }
  }

  function openStarsTopUp() {
    const webApp =
      getTelegramWebApp();

    const url =
      "https://t.me/PremiumBot";

    if (webApp) {
      const openTelegramLink =
        (
          webApp as unknown as {
            openTelegramLink?: (
              url: string
            ) => void;
          }
        ).openTelegramLink;

      if (openTelegramLink) {
        openTelegramLink(url);
        return;
      }
    }

    window.location.href =
      url;
  }

  if (loading) {
    return (
      <main className="roam-page flex min-h-screen items-center justify-center text-sm text-white/40">
        Загружаем заказ...
      </main>
    );
  }

  if (
    error &&
    !order
  ) {
    return (
      <main className="roam-page flex min-h-screen items-center justify-center px-6 text-white">
        <div className="max-w-sm text-center">
          <div className="text-2xl font-bold">
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

  const isReady =
    order.status ===
    "esim_ready";

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container-no-nav">
        <Brand />

        <header className="mt-9">
          <div className="roam-kicker">
            Secure payment
          </div>

          <h1 className="mt-3 text-[42px] font-black tracking-[-0.05em]">
            {isPending
              ? "Оплата."
              : isReady
                ? "Готово."
                : "Заказ принят."}
          </h1>

          <p className="roam-subtitle mt-3">
            {isPending
              ? "Выберите удобный способ оплаты."
              : "Платёж подтверждён. WYLD ROAM обрабатывает заказ."}
          </p>
        </header>

        <section className="roam-card mt-7 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
                Статус
              </div>

              <div className="mt-2 text-lg font-bold">
                {statusLabel(
                  order.status
                )}
              </div>
            </div>

            <div className="roam-chip">
              {isPending
                ? "WAITING"
                : "CONFIRMED"}
            </div>
          </div>

          <div className="roam-divider my-6" />

          <div className="grid grid-cols-2 gap-3">
            <div className="roam-stat">
              <div className="roam-stat-label">
                Страна
              </div>
              <div className="roam-stat-value">
                {order.country}
              </div>
            </div>

            <div className="roam-stat">
              <div className="roam-stat-label">
                Интернет
              </div>
              <div className="roam-stat-value">
                {order.data}
              </div>
            </div>

            <div className="roam-stat">
              <div className="roam-stat-label">
                Срок
              </div>
              <div className="roam-stat-value">
                {durationLabel(
                  order.duration,
                  order.durationUnit
                )}
              </div>
            </div>

            <div className="roam-stat">
              <div className="roam-stat-label">
                Стоимость
              </div>
              <div className="roam-stat-value">
                $
                {Number(
                  order.amount
                ).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-5 text-[11px] text-white/30">
            Тариф
          </div>

          <div className="mt-1 text-sm font-semibold">
            {order.planName}
          </div>
        </section>

        {isPending ? (
          <>
            <section className="roam-card-soft mt-5 p-5">
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/30">
                Payment method
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-white/[0.06] text-3xl">
                  ⭐
                </div>

                <div className="flex-1">
                  <div className="font-bold">
                    Telegram Stars
                  </div>

                  <div className="mt-1 text-xs text-white/35">
                    Встроенная оплата
                    Telegram
                  </div>
                </div>

                {starsAmount && (
                  <div className="text-lg font-black">
                    {starsAmount} ⭐
                  </div>
                )}
              </div>
            </section>

            {error && (
              <div className="roam-error mt-5">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={
                payWithStars
              }
              disabled={paying}
              className="roam-primary mt-6"
            >
              {paying
                ? "Ожидаем оплату..."
                : starsAmount
                  ? `Оплатить · ${starsAmount} ⭐`
                  : "Оплатить Stars ⭐"}
            </button>

            <button
              type="button"
              onClick={
                payWithCrypto
              }
              disabled={
                paying ||
                cryptoPaying
              }
              className="roam-secondary mt-3"
            >
              {cryptoPaying
                ? "Создаём крипто-платёж..."
                : "Оплатить криптовалютой"}
            </button>

            <button
              type="button"
              onClick={
                openStarsTopUp
              }
              disabled={
                paying ||
                cryptoPaying
              }
              className="mt-3 w-full rounded-[18px] px-5 py-4 text-sm font-semibold text-white/45 transition hover:text-white/70"
            >
              Купить Stars
            </button>

            <p className="mt-4 text-center text-[10px] leading-5 text-white/24">
              Telegram Stars оплачиваются
              внутри Telegram.
              Криптооплата открывается
              через защищённую платёжную
              страницу Heleket.
            </p>
          </>
        ) : (
          <section className="roam-card mt-5 p-6">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-cyan-300/[0.12] text-xl text-cyan-100">
              ✓
            </div>

            <div className="mt-4 text-xl font-black">
              Оплата подтверждена
            </div>

            <p className="mt-2 text-sm leading-6 text-white/43">
              {isReady
                ? "Ваша eSIM уже готова к установке."
                : "eSIM выпускается автоматически. Обычно это занимает немного времени."}
            </p>

            <Link
              href="/my-esims"
              className="roam-primary mt-5"
            >
              Открыть мои eSIM
              <span>→</span>
            </Link>
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
        <main className="roam-page flex min-h-screen items-center justify-center text-sm text-white/40">
          Загружаем...
        </main>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
