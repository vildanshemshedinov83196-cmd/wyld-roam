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
  activation_code: string | null;
  smdp_address: string | null;
  status: string;
  remaining_data_bytes:
    | number
    | null;
  expires_at: string | null;
};

/*
 * Уже оплаченный настоящий заказ.
 * Russia — 100MB / 7 Days.
 *
 * После успешного живого теста
 * этот временный механизм удалим.
 */
const LIVE_TEST_ORDER_ID =
  "e89032c3-9c9d-4006-9597-25ab41f4e3e1";

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

  const [
    telegramMode,
    setTelegramMode,
  ] = useState(false);

  const [
    issuing,
    setIssuing,
  ] = useState(false);

  const [
    issueMessage,
    setIssueMessage,
  ] = useState("");

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

    async function loadEsims() {
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

        if (
          data.success
        ) {
          setEsims(
            data.esims ?? []
          );

          return (
            data.esims ?? []
          ) as Esim[];
        }
      } catch (
        error
      ) {
        console.error(
          "Load eSIMs error:",
          error
        );
      } finally {
        setLoading(false);
      }

      return [];
    }

    async function run() {
      const currentEsims =
        (await loadEsims()) ?? [];

      if (!initData) {
        return;
      }

      /*
       * Если эта eSIM уже появилась,
       * повторный запуск не нужен.
       */
      const alreadyExists =
        currentEsims.some(
          (esim) =>
            esim.order_id ===
            LIVE_TEST_ORDER_ID
        );

      if (
        alreadyExists
      ) {
        return;
      }

      /*
       * Дополнительная защита браузера
       * от нескольких одновременных
       * вызовов при повторном render.
       *
       * Сервер всё равно остаётся
       * главным idempotency-контролем.
       */
      const storageKey =
        `wyld-live-issue-${LIVE_TEST_ORDER_ID}`;

      if (
        sessionStorage.getItem(
          storageKey
        ) === "running"
      ) {
        return;
      }

      sessionStorage.setItem(
        storageKey,
        "running"
      );

      setIssuing(true);
      setIssueMessage(
        "Выпускаем вашу eSIM..."
      );

      try {
        const response =
          await fetch(
            "/api/esim/issue",
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
                    LIVE_TEST_ORDER_ID,
                }),
            }
          );

        const data =
          await response.json();

        console.log(
          "Live eSIM issue:",
          data
        );

        if (
          data.success &&
          data.ready
        ) {
          setIssueMessage(
            "eSIM готова"
          );
        } else if (
          data.success &&
          data.alreadyReady
        ) {
          setIssueMessage(
            "eSIM уже готова"
          );
        } else if (
          data.success &&
          data.pending
        ) {
          setIssueMessage(
            "eSIM куплена. Поставщик подготавливает профиль..."
          );
        } else {
          sessionStorage.removeItem(
            storageKey
          );

          setIssueMessage(
            data.error ??
              "Не удалось выпустить eSIM"
          );
        }

        /*
         * Перечитываем список.
         * Даже pending-запись уже должна
         * появиться в «Мои eSIM».
         */
        await loadEsims();
      } catch (
        error
      ) {
        console.error(
          "Issue eSIM error:",
          error
        );

        sessionStorage.removeItem(
          storageKey
        );

        setIssueMessage(
          "Ошибка соединения при выпуске eSIM"
        );
      } finally {
        setIssuing(false);
      }
    }

    run();
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
            Ваши подключённые eSIM
            и их статус
          </p>
        </header>

        {issuing && (
          <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.07] p-5">
            <div className="text-sm font-semibold">
              Подготовка eSIM
            </div>

            <div className="mt-2 text-sm text-white/45">
              {issueMessage}
            </div>
          </div>
        )}

        {!issuing &&
          issueMessage && (
            <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.07] p-5 text-sm">
              {issueMessage}
            </div>
          )}

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
              {issuing
                ? "Выпускаем eSIM"
                : "Пока пусто"}
            </div>

            <p className="mt-3 text-sm leading-6 text-white/45">
              {issuing
                ? "Подождите немного. Профиль создаётся у оператора."
                : "После первой покупки ваша eSIM появится здесь автоматически."}
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

                  {esim.smdp_address && (
                    <div className="mt-4">
                      <div className="text-xs text-white/35">
                        SM-DP+
                      </div>

                      <div className="mt-1 break-all text-sm">
                        {
                          esim.smdp_address
                        }
                      </div>
                    </div>
                  )}

                  {esim.activation_code && (
                    <div className="mt-4">
                      <div className="text-xs text-white/35">
                        Код активации
                      </div>

                      <div className="mt-1 break-all text-sm">
                        {
                          esim.activation_code
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
