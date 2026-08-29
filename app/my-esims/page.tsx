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

type Esim = {
  id: string;
  order_id: string;
  package_code: string;
  country_code: string;
  iccid: string | null;
  qr_code: string | null;
  activation_code:
    | string
    | null;
  smdp_address:
    | string
    | null;
  status: string;
  remaining_data_bytes:
    | number
    | null;
  expires_at:
    | string
    | null;
};

function statusLabel(
  status: string
) {
  switch (status) {
    case "pending":
      return "Подготавливается";

    case "ready":
      return "Готова";

    case "active":
      return "Активна";

    case "suspended":
      return "Приостановлена";

    case "expired":
      return "Истекла";

    case "revoked":
      return "Отозвана";

    case "failed":
      return "Ошибка";

    default:
      return status;
  }
}

export default function MyEsimsPage() {
  const [esims, setEsims] =
    useState<Esim[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [telegramMode, setTelegramMode] =
    useState(false);

  useEffect(() => {
    const webApp =
      getTelegramWebApp();

    const initData =
      getTelegramInitData();

    if (
      webApp &&
      initData
    ) {
      setTelegramMode(true);

      webApp.ready();
      webApp.expand();
    }

    async function load() {
      if (!initData) {
        setLoading(false);
        return;
      }

      try {
        const response =
          await fetch(
            "/api/my-esims",
            {
              headers: {
                "x-telegram-init-data":
                  initData,
              },

              cache:
                "no-store",
            }
          );

        const data =
          await response.json();

        if (data.success) {
          setEsims(
            data.esims ?? []
          );
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-8">
        <header className="mb-8">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
            WYLD ROAM
          </div>

          <h1 className="text-4xl font-semibold">
            Мои eSIM
          </h1>

          <p className="mt-3 text-sm text-white/45">
            Ваши подключённые
            eSIM и их статус
          </p>
        </header>

        {loading ? (
          <div className="py-16 text-center text-sm text-white/40">
            Загружаем...
          </div>
        ) : !telegramMode ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            <div className="text-xl font-semibold">
              Откройте WYLD ROAM
              в Telegram
            </div>

            <p className="mt-3 text-sm leading-6 text-white/45">
              Раздел «Мои eSIM»
              привязан к вашему
              Telegram-аккаунту.
            </p>
          </div>
        ) : esims.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            <div className="text-xl font-semibold">
              Пока пусто
            </div>

            <p className="mt-3 text-sm leading-6 text-white/45">
              После первой покупки
              ваша eSIM появится
              здесь автоматически.
            </p>

            <Link
              href="/"
              className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-white font-semibold text-black"
            >
              Выбрать eSIM
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {esims.map(
              (esim) => (
                <article
                  key={
                    esim.id
                  }
                  className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-2xl font-semibold">
                        {
                          esim.country_code
                        }
                      </div>

                      <div className="mt-1 text-sm text-white/40">
                        {
                          esim.package_code
                        }
                      </div>
                    </div>

                    <div className="rounded-full bg-white/10 px-3 py-2 text-xs">
                      {statusLabel(
                        esim.status
                      )}
                    </div>
                  </div>

                  {esim.iccid && (
                    <div className="mt-5 border-t border-white/10 pt-5">
                      <div className="text-xs text-white/35">
                        ICCID
                      </div>

                      <div className="mt-1 break-all text-sm">
                        {
                          esim.iccid
                        }
                      </div>
                    </div>
                  )}
                </article>
              )
            )}
          </div>
        )}

        <nav className="fixed bottom-5 left-1/2 z-20 flex w-[calc(100%-40px)] max-w-sm -translate-x-1/2 rounded-3xl border border-white/10 bg-[#151515]/95 p-2 backdrop-blur-xl">
          <Link
            href="/"
            className="flex h-12 flex-1 items-center justify-center rounded-2xl text-sm text-white/45"
          >
            🌍 eSIM
          </Link>

          <div className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-black">
            📱 Мои eSIM
          </div>
        </nav>
      </div>
    </main>
  );
}
