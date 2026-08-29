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
  remaining_data_bytes: number | null;
  expires_at: string | null;
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

function formatBytes(
  value: number | null
) {
  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const gb =
    value /
    1024 /
    1024 /
    1024;

  if (gb >= 1) {
    return `${gb.toFixed(
      gb >= 10 ? 0 : 2
    )} GB`;
  }

  const mb =
    value /
    1024 /
    1024;

  return `${Math.max(
    Math.round(mb),
    0
  )} MB`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

function getLpaString(
  esim: Esim
) {
  if (
    !esim.smdp_address ||
    !esim.activation_code
  ) {
    return null;
  }

  return `LPA:1$${esim.smdp_address}$${esim.activation_code}`;
}

function getInstallUrl(
  esim: Esim
) {
  const lpa =
    getLpaString(esim);

  if (!lpa) {
    return null;
  }

  return (
    "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=" +
    encodeURIComponent(lpa)
  );
}

async function copyText(
  value: string
) {
  try {
    await navigator.clipboard.writeText(
      value
    );

    return true;
  } catch {
    return false;
  }
}

export default function MyEsimsPage() {
  const [
    esims,
    setEsims,
  ] = useState<Esim[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    telegramMode,
    setTelegramMode,
  ] = useState(false);

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    copied,
    setCopied,
  ] = useState<string | null>(
    null
  );

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
        return [];
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

        const list =
          data.success
            ? data.esims ?? []
            : [];

        setEsims(list);

        return list as Esim[];
      } catch (error) {
        console.error(
          "Load eSIMs error:",
          error
        );

        return [];
      } finally {
        setLoading(false);
      }
    }

    async function syncPending(
      list: Esim[]
    ) {
      if (!initData) {
        return;
      }

      const pending =
        list.filter(
          (esim) =>
            esim.status ===
            "pending"
        );

      if (
        pending.length === 0
      ) {
        return;
      }

      setSyncing(true);

      try {
        for (
          const esim of pending
        ) {
          try {
            await fetch(
              "/api/esim/issue",
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
                      esim.order_id,
                  }),
              }
            );
          } catch (error) {
            console.error(
              "eSIM sync error:",
              error
            );
          }
        }

        await loadEsims();
      } finally {
        setSyncing(false);
      }
    }

    async function run() {
      const list =
        await loadEsims();

      await syncPending(
        list
      );
    }

    run();
  }, []);

  async function handleCopy(
    key: string,
    value: string
  ) {
    const success =
      await copyText(
        value
      );

    if (!success) {
      return;
    }

    setCopied(key);

    window.setTimeout(
      () => {
        setCopied(
          (current) =>
            current === key
              ? null
              : current
        );
      },
      1500
    );
  }

  function openInstall(
    esim: Esim
  ) {
    const url =
      getInstallUrl(esim);

    if (!url) {
      return;
    }

    window.location.href =
      url;
  }

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
            Ваши eSIM, установка
            и управление
          </p>
        </header>

        {syncing && (
          <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.07] p-5">
            <div className="text-sm font-semibold">
              Подготавливаем eSIM
            </div>

            <div className="mt-2 text-sm text-white/45">
              Получаем профиль
              от оператора...
            </div>
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
              Этот раздел привязан
              к вашему Telegram-аккаунту.
            </p>
          </div>
        ) : esims.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            <div className="text-xl font-semibold">
              Пока пусто
            </div>

            <p className="mt-3 text-sm leading-6 text-white/45">
              После покупки ваша
              eSIM появится здесь
              автоматически.
            </p>

            <Link
              href="/"
              className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-white font-semibold text-black"
            >
              Выбрать eSIM
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {esims.map(
              (esim) => {
                const remaining =
                  formatBytes(
                    esim.remaining_data_bytes
                  );

                const expires =
                  formatDate(
                    esim.expires_at
                  );

                const lpa =
                  getLpaString(
                    esim
                  );

                const installUrl =
                  getInstallUrl(
                    esim
                  );

                const qrIsUrl =
                  Boolean(
                    esim.qr_code &&
                      /^https?:\/\//i.test(
                        esim.qr_code
                      )
                  );

                return (
                  <article
                    key={
                      esim.id
                    }
                    className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.05]"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-3xl font-semibold">
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

                      {(remaining ||
                        expires) && (
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          {remaining && (
                            <div className="rounded-2xl bg-white/[0.06] p-4">
                              <div className="text-xs text-white/35">
                                Осталось
                              </div>

                              <div className="mt-1 font-semibold">
                                {
                                  remaining
                                }
                              </div>
                            </div>
                          )}

                          {expires && (
                            <div className="rounded-2xl bg-white/[0.06] p-4">
                              <div className="text-xs text-white/35">
                                Действует до
                              </div>

                              <div className="mt-1 font-semibold">
                                {
                                  expires
                                }
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {esim.status ===
                        "pending" && (
                        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/50">
                          Профиль уже
                          заказан. Обычно
                          подготовка занимает
                          немного времени.
                        </div>
                      )}

                      {esim.status ===
                        "ready" && (
                        <>
                          {qrIsUrl && (
                            <div className="mt-6 rounded-3xl bg-white p-5">
                              <div className="mb-4 text-center text-sm font-semibold text-black">
                                QR-код установки
                              </div>

                              <img
                                src={
                                  esim.qr_code!
                                }
                                alt="QR-код eSIM"
                                className="mx-auto aspect-square w-full max-w-[260px] object-contain"
                              />

                              <div className="mt-4 text-center text-xs leading-5 text-black/50">
                                Откройте этот
                                QR-код на другом
                                устройстве и
                                отсканируйте его
                                телефоном.
                              </div>
                            </div>
                          )}

                          {installUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                openInstall(
                                  esim
                                )
                              }
                              className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-white text-base font-semibold text-black"
                            >
                              Установить eSIM
                            </button>
                          )}

                          <div className="mt-6 border-t border-white/10 pt-5">
                            <div className="mb-4 text-sm font-semibold">
                              Ручная установка
                            </div>

                            {esim.smdp_address && (
                              <div className="mb-4 rounded-2xl bg-white/[0.05] p-4">
                                <div className="text-xs text-white/35">
                                  SM-DP+
                                </div>

                                <div className="mt-2 break-all text-sm">
                                  {
                                    esim.smdp_address
                                  }
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(
                                      `${esim.id}-smdp`,
                                      esim.smdp_address!
                                    )
                                  }
                                  className="mt-3 text-sm font-semibold text-white/70"
                                >
                                  {copied ===
                                  `${esim.id}-smdp`
                                    ? "Скопировано ✓"
                                    : "Скопировать"}
                                </button>
                              </div>
                            )}

                            {esim.activation_code && (
                              <div className="mb-4 rounded-2xl bg-white/[0.05] p-4">
                                <div className="text-xs text-white/35">
                                  Код активации
                                </div>

                                <div className="mt-2 break-all text-sm">
                                  {
                                    esim.activation_code
                                  }
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopy(
                                      `${esim.id}-activation`,
                                      esim.activation_code!
                                    )
                                  }
                                  className="mt-3 text-sm font-semibold text-white/70"
                                >
                                  {copied ===
                                  `${esim.id}-activation`
                                    ? "Скопировано ✓"
                                    : "Скопировать"}
                                </button>
                              </div>
                            )}

                            {lpa && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    `${esim.id}-lpa`,
                                    lpa
                                  )
                                }
                                className="flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-sm font-semibold"
                              >
                                {copied ===
                                `${esim.id}-lpa`
                                  ? "Строка установки скопирована ✓"
                                  : "Скопировать данные установки"}
                              </button>
                            )}
                          </div>

                          {esim.iccid && (
                            <div className="mt-5 border-t border-white/10 pt-5">
                              <div className="text-xs text-white/35">
                                ICCID
                              </div>

                              <div className="mt-1 break-all text-xs text-white/55">
                                {
                                  esim.iccid
                                }
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              }
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
