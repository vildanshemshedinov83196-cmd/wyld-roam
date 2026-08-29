"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  getTelegramInitData,
  getTelegramWebApp,
} from "@/lib/telegram-client";

type PeriodStats = {
  sales: number;
  revenue: number;
  profit: number;
};

type Stats = {
  totalSales: number;
  revenue: number;
  supplierCost: number;
  profit: number;
  totalStars: number;
  supplierBalance:
    number | null;

  today: PeriodStats;
  sevenDays: PeriodStats;
  thirtyDays: PeriodStats;
};

type Sale = {
  id: string;
  country: string;
  planName: string;
  amount: number;
  supplierCost: number;
  profit: number;
  status: string;
  createdAt: string;
};

function money(
  value:
    | number
    | null
) {
  if (
    value === null
  ) {
    return "—";
  }

  return `$${value.toFixed(
    2
  )}`;
}

export default function AdminPage() {
  const [
    stats,
    setStats,
  ] = useState<
    Stats | null
  >(null);

  const [
    sales,
    setSales,
  ] = useState<
    Sale[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  useEffect(() => {
    const webApp =
      getTelegramWebApp();

    webApp?.ready();
    webApp?.expand();

    async function load() {
      try {
        const initData =
          getTelegramInitData();

        if (!initData) {
          throw new Error(
            "Откройте админку внутри Telegram."
          );
        }

        const response =
          await fetch(
            "/api/admin/stats",
            {
              headers: {
                "x-telegram-init-data":
                  initData,
              },

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
              "Не удалось загрузить статистику"
          );
        }

        setStats(
          result.stats
        );

        setSales(
          result.recentSales ??
            []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Ошибка загрузки"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white/40">
        Загружаем статистику...
      </main>
    );
  }

  if (
    error ||
    !stats
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
        <div className="text-center">
          <div className="text-2xl font-semibold">
            Доступ закрыт
          </div>

          <div className="mt-3 text-sm text-white/40">
            {error}
          </div>

          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 font-semibold text-black"
          >
            На главную
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-md px-5 pb-16 pt-8">
        <header>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/35">
            WYLD ROAM
          </div>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Статистика
          </h1>

          <p className="mt-3 text-sm text-white/40">
            Панель владельца
          </p>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-xs text-white/35">
              Продаж
            </div>

            <div className="mt-2 text-3xl font-semibold">
              {
                stats.totalSales
              }
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-xs text-white/35">
              Выручка
            </div>

            <div className="mt-2 text-2xl font-semibold">
              {money(
                stats.revenue
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-xs text-white/35">
              Прибыль
            </div>

            <div className="mt-2 text-2xl font-semibold">
              {money(
                stats.profit
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
            <div className="text-xs text-white/35">
              Получено
            </div>

            <div className="mt-2 text-2xl font-semibold">
              {
                stats.totalStars
              }{" "}
              ⭐
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="text-sm text-white/40">
            Баланс eSIMAccess
          </div>

          <div className="mt-3 text-4xl font-semibold">
            {money(
              stats.supplierBalance
            )}
          </div>

          <div className="mt-2 text-xs text-white/25">
            Баланс поставщика
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-3 text-sm font-semibold">
            Периоды
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="flex justify-between">
                <span>
                  Сегодня
                </span>

                <span className="font-semibold">
                  {
                    stats.today
                      .sales
                  }{" "}
                  продаж
                </span>
              </div>

              <div className="mt-2 text-sm text-white/40">
                {money(
                  stats.today
                    .revenue
                )}{" "}
                · прибыль{" "}
                {money(
                  stats.today
                    .profit
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="flex justify-between">
                <span>
                  7 дней
                </span>

                <span className="font-semibold">
                  {
                    stats.sevenDays
                      .sales
                  }{" "}
                  продаж
                </span>
              </div>

              <div className="mt-2 text-sm text-white/40">
                {money(
                  stats.sevenDays
                    .revenue
                )}{" "}
                · прибыль{" "}
                {money(
                  stats.sevenDays
                    .profit
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.05] p-4">
              <div className="flex justify-between">
                <span>
                  30 дней
                </span>

                <span className="font-semibold">
                  {
                    stats.thirtyDays
                      .sales
                  }{" "}
                  продаж
                </span>
              </div>

              <div className="mt-2 text-sm text-white/40">
                {money(
                  stats.thirtyDays
                    .revenue
                )}{" "}
                · прибыль{" "}
                {money(
                  stats.thirtyDays
                    .profit
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-3 text-sm font-semibold">
            Последние продажи
          </div>

          {sales.length ===
          0 ? (
            <div className="rounded-2xl bg-white/[0.04] p-5 text-sm text-white/35">
              Оплаченных продаж пока нет.
            </div>
          ) : (
            <div className="space-y-3">
              {sales.map(
                (
                  sale
                ) => (
                  <div
                    key={
                      sale.id
                    }
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">
                          {
                            sale.country
                          }{" "}
                          ·{" "}
                          {
                            sale.planName
                          }
                        </div>

                        <div className="mt-2 text-xs text-white/30">
                          {new Date(
                            sale.createdAt
                          ).toLocaleString(
                            "ru-RU"
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold">
                          {money(
                            sale.amount
                          )}
                        </div>

                        <div className="mt-1 text-xs text-white/35">
                          +
                          {money(
                            sale.profit
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <Link
          href="/"
          className="mt-8 flex h-14 items-center justify-center rounded-2xl bg-white font-semibold text-black"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
