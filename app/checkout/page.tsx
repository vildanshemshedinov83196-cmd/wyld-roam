"use client";

import {
  Suspense,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  BackButton,
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

import {
  getTelegramInitData,
  getTelegramWebApp,
} from "@/lib/telegram-client";

function getFlagEmoji(
  code: string
) {
  if (code.length !== 2) {
    return "🌍";
  }

  return code
    .toUpperCase()
    .replace(
      /./g,
      (char) =>
        String.fromCodePoint(
          127397 +
            char.charCodeAt(0)
        )
    );
}

function CheckoutContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const packageCode =
    searchParams.get(
      "packageCode"
    ) ??
    searchParams.get(
      "package"
    ) ??
    "";

  const country =
    (
      searchParams.get(
        "country"
      ) ??
      searchParams.get(
        "code"
      ) ??
      ""
    ).toUpperCase();

  const planName =
    searchParams.get(
      "planName"
    ) ??
    searchParams.get(
      "name"
    ) ??
    "Выбранная eSIM";

  const data =
    searchParams.get(
      "data"
    ) ?? "";

  const duration =
    searchParams.get(
      "duration"
    ) ?? "";

  const durationUnit =
    searchParams.get(
      "durationUnit"
    ) ?? "DAY";

  const amount =
    searchParams.get(
      "amount"
    ) ?? "";

  const networks =
    searchParams.get(
      "networks"
    ) ?? "";

  const durationLabel =
    useMemo(() => {
      if (!duration) {
        return "";
      }

      const value =
        Number(duration);

      if (
        !Number.isFinite(
          value
        )
      ) {
        return duration;
      }

      if (
        [
          "DAY",
          "day",
          "days",
        ].includes(
          durationUnit
        )
      ) {
        if (
          value % 10 === 1 &&
          value % 100 !== 11
        ) {
          return `${value} день`;
        }

        if (
          value % 10 >= 2 &&
          value % 10 <= 4 &&
          !(
            value % 100 >=
              12 &&
            value % 100 <=
              14
          )
        ) {
          return `${value} дня`;
        }

        return `${value} дней`;
      }

      return `${value} ${durationUnit}`;
    }, [
      duration,
      durationUnit,
    ]);

  async function createOrder() {
    if (
      !packageCode ||
      !country
    ) {
      setError(
        "Не удалось определить тариф. Вернитесь назад и выберите eSIM ещё раз."
      );
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const initData =
        getTelegramInitData();

      const response =
        await fetch(
          "/api/orders/create",
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
                packageCode,
                country,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success ||
        !result.order?.id
      ) {
        throw new Error(
          result.error ??
            "Не удалось создать заказ"
        );
      }

      router.push(
        `/payment?order=${encodeURIComponent(
          result.order.id
        )}`
      );
    } catch (err) {
      console.error(
        "Checkout error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Не удалось создать заказ"
      );
    } finally {
      setCreating(false);
    }
  }

  if (
    typeof window !==
    "undefined"
  ) {
    const webApp =
      getTelegramWebApp();

    if (webApp) {
      webApp.ready();
      webApp.expand();
    }
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container-no-nav">
        <div className="flex items-center justify-between">
          <BackButton
            href={
              country
                ? `/plans/${country}`
                : "/"
            }
          />

          <Brand />
        </div>

        <header className="mt-9">
          <div className="roam-kicker">
            Checkout
          </div>

          <h1 className="mt-3 text-[40px] font-black tracking-[-0.05em]">
            Всё готово.
          </h1>

          <p className="roam-subtitle mt-3">
            Проверьте выбранный
            тариф перед оплатой.
          </p>
        </header>

        <section className="roam-card mt-7 p-6">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[21px] border border-white/10 bg-white/[0.055] text-3xl">
              {getFlagEmoji(
                country
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-[0.17em] text-white/30">
                Направление
              </div>

              <div className="mt-1 text-2xl font-black">
                {country || "—"}
              </div>
            </div>

            {amount && (
              <div className="text-right">
                <div className="text-xs text-white/30">
                  Итого
                </div>

                <div className="mt-1 text-2xl font-black">
                  $
                  {Number(
                    amount
                  ).toFixed(2)}
                </div>
              </div>
            )}
          </div>

          <div className="roam-divider my-6" />

          <div className="text-xs uppercase tracking-[0.17em] text-white/30">
            Тариф
          </div>

          <div className="mt-2 text-xl font-bold">
            {planName}
          </div>

          {(data ||
            durationLabel) && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              {data && (
                <div className="roam-stat">
                  <div className="roam-stat-label">
                    Интернет
                  </div>

                  <div className="roam-stat-value">
                    {data}
                  </div>
                </div>
              )}

              {durationLabel && (
                <div className="roam-stat">
                  <div className="roam-stat-label">
                    Срок
                  </div>

                  <div className="roam-stat-value">
                    {
                      durationLabel
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {networks && (
            <div className="roam-card-soft mt-4 p-4">
              <div className="text-[11px] text-white/30">
                Доступные сети
              </div>

              <div className="mt-2 text-sm leading-6 text-white/65">
                {networks}
              </div>
            </div>
          )}
        </section>

        <section className="roam-card-soft mt-5 p-5">
          <div className="text-sm font-bold">
            После оплаты
          </div>

          <div className="mt-5 space-y-5">
            {[
              [
                "1",
                "Подтверждаем платёж",
                "Telegram сообщает WYLD ROAM об успешной оплате.",
              ],
              [
                "2",
                "Выпускаем eSIM",
                "Профиль автоматически заказывается у оператора.",
              ],
              [
                "3",
                "Готово к установке",
                "QR-код появится в разделе «Мои eSIM».",
              ],
            ].map(
              ([
                number,
                title,
                text,
              ]) => (
                <div
                  key={number}
                  className="flex gap-4"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-cyan-300/[0.09] text-xs font-black text-cyan-100">
                    {number}
                  </div>

                  <div>
                    <div className="text-sm font-bold">
                      {title}
                    </div>

                    <div className="mt-1 text-xs leading-5 text-white/37">
                      {text}
                    </div>
                  </div>
                </div>
              )
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
            createOrder
          }
          disabled={
            creating ||
            !packageCode ||
            !country
          }
          className="roam-primary mt-6"
        >
          {creating
            ? "Создаём заказ..."
            : amount
              ? `Перейти к оплате · $${Number(
                  amount
                ).toFixed(2)}`
              : "Перейти к оплате"}
        </button>

        <p className="mt-4 px-6 text-center text-[10px] leading-5 text-white/24">
          Финальная стоимость
          проверяется сервером
          перед созданием заказа.
        </p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="roam-page flex min-h-screen items-center justify-center text-sm text-white/40">
          Загружаем...
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
