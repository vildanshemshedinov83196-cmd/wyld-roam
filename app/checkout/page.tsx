"use client";

import Link from "next/link";
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
  getTelegramInitData,
  getTelegramWebApp,
} from "@/lib/telegram-client";

function CheckoutContent() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [creating, setCreating] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null
    );

  /*
   * Поддерживаем несколько вариантов
   * названия параметров, чтобы старые
   * ссылки WYLD ROAM тоже продолжали
   * работать.
   */
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

  /*
   * Эти данные нужны только
   * для красивого отображения.
   *
   * Сервер им НЕ доверяет:
   * настоящую цену сервер всё равно
   * заново получает у eSIMAccess.
   */
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
    ) ??
    "";

  const duration =
    searchParams.get(
      "duration"
    ) ??
    "";

  const durationUnit =
    searchParams.get(
      "durationUnit"
    ) ??
    "DAY";

  const amount =
    searchParams.get(
      "amount"
    ) ??
    "";

  const networks =
    searchParams.get(
      "networks"
    ) ??
    "";

  const durationLabel =
    useMemo(() => {
      if (!duration) {
        return "";
      }

      const value =
        Number(duration);

      if (
        !Number.isFinite(value)
      ) {
        return duration;
      }

      if (
        durationUnit === "DAY" ||
        durationUnit === "day" ||
        durationUnit === "days"
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
            value % 100 >= 12 &&
            value % 100 <= 14
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
        "Не удалось определить выбранный тариф. Вернитесь назад и выберите eSIM ещё раз."
      );

      return;
    }

    setCreating(true);
    setError(null);

    try {
      /*
       * Получаем initData именно
       * из Telegram Mini App.
       *
       * При обычном localhost
       * здесь будет пустая строка —
       * это нормально для разработки.
       */
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

            body: JSON.stringify({
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

      /*
       * После создания заказа
       * открываем страницу оплаты.
       */
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

  function expandTelegram() {
    const webApp =
      getTelegramWebApp();

    if (!webApp) {
      return;
    }

    webApp.ready();
    webApp.expand();
  }

  /*
   * При рендере внутри Telegram
   * expand безопасно можно вызвать
   * перед взаимодействием.
   */
  if (
    typeof window !==
    "undefined"
  ) {
    expandTelegram();
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-7">
        {/* Верхняя панель */}
        <header className="mb-8">
          <Link
            href={
              country
                ? `/plans/${country}`
                : "/"
            }
            className="mb-7 inline-flex items-center gap-2 text-sm text-white/45 transition hover:text-white"
          >
            <span>
              ←
            </span>

            <span>
              Назад
            </span>
          </Link>

          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/35">
            WYLD ROAM
          </div>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Оформление
          </h1>

          <p className="mt-3 max-w-sm text-sm leading-6 text-white/45">
            Проверьте тариф перед
            созданием заказа
          </p>
        </header>

        {/* Основная карточка */}
        <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.05]">
          <div className="p-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                  Направление
                </div>

                <div className="mt-2 text-3xl font-semibold">
                  {country ||
                    "—"}
                </div>
              </div>

              {amount && (
                <div className="text-right">
                  <div className="text-xs text-white/30">
                    Итого
                  </div>

                  <div className="mt-2 text-2xl font-semibold">
                    $
                    {Number(
                      amount
                    ).toFixed(
                      2
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="my-6 h-px bg-white/10" />

            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                Тариф
              </div>

              <div className="mt-2 text-xl font-semibold">
                {planName}
              </div>
            </div>

            {(data ||
              durationLabel) && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {data && (
                  <div className="rounded-2xl bg-white/[0.05] p-4">
                    <div className="text-xs text-white/30">
                      Интернет
                    </div>

                    <div className="mt-2 font-semibold">
                      {data}
                    </div>
                  </div>
                )}

                {durationLabel && (
                  <div className="rounded-2xl bg-white/[0.05] p-4">
                    <div className="text-xs text-white/30">
                      Срок
                    </div>

                    <div className="mt-2 font-semibold">
                      {
                        durationLabel
                      }
                    </div>
                  </div>
                )}
              </div>
            )}

            {networks && (
              <div className="mt-5">
                <div className="text-xs text-white/30">
                  Сети
                </div>

                <div className="mt-2 text-sm leading-6 text-white/70">
                  {networks}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Что произойдёт */}
        <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
          <div className="text-sm font-semibold">
            Что произойдёт после
            оплаты
          </div>

          <div className="mt-5 space-y-5">
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
                1
              </div>

              <div>
                <div className="text-sm font-medium">
                  Подтверждаем платёж
                </div>

                <div className="mt-1 text-xs leading-5 text-white/35">
                  WYLD ROAM автоматически
                  получает подтверждение
                  оплаты.
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
                2
              </div>

              <div>
                <div className="text-sm font-medium">
                  Выпускаем eSIM
                </div>

                <div className="mt-1 text-xs leading-5 text-white/35">
                  После подтверждения
                  оплаты eSIM будет
                  заказана автоматически.
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
                3
              </div>

              <div>
                <div className="text-sm font-medium">
                  Получаете установку
                </div>

                <div className="mt-1 text-xs leading-5 text-white/35">
                  QR-код и данные eSIM
                  появятся в разделе
                  «Мои eSIM».
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ошибка */}
        {error && (
          <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
            {error}
          </div>
        )}

        {/* Кнопка */}
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
          className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-white px-5 text-base font-semibold text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating
            ? "Создаём заказ..."
            : amount
              ? `Перейти к оплате · $${Number(
                  amount
                ).toFixed(
                  2
                )}`
              : "Перейти к оплате"}
        </button>

        <p className="mt-4 px-4 text-center text-[11px] leading-5 text-white/25">
          Финальная стоимость
          рассчитывается сервером
          WYLD ROAM по актуальному
          тарифу поставщика.
        </p>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#050505] text-sm text-white/40">
          Загружаем...
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
