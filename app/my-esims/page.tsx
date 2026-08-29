"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  BottomNav,
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

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

function getCountryName(
  code: string
) {
  try {
    const names =
      new Intl.DisplayNames(
        ["ru"],
        {
          type: "region",
        }
      );

    return (
      names.of(code) ??
      code
    );
  } catch {
    return code;
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

  return `${Math.max(
    Math.round(
      value /
        1024 /
        1024
    ),
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
  ] = useState<
    string | null
  >(null);

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
          const esim
          of pending
        ) {
          try {
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

    async function recoverPaidOrders() {
      if (!initData) {
        return;
      }

      try {
        const response =
          await fetch(
            "/api/esim/recover",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  initData,
                }),

              cache:
                "no-store",
            }
          );

        if (!response.ok) {
          console.error(
            "eSIM recovery failed"
          );
        }
      } catch (error) {
        console.error(
          "eSIM recovery request error:",
          error
        );
      }
    }

    async function run() {
      await recoverPaidOrders();

      const list =
        await loadEsims();

      await syncPending(list);
    }

    run();
  }, []);

  async function handleCopy(
    key: string,
    value: string
  ) {
    const success =
      await copyText(value);

    if (!success) {
      return;
    }

    setCopied(key);

    window.setTimeout(
      () =>
        setCopied(
          (current) =>
            current === key
              ? null
              : current
        ),
      1500
    );
  }

  function openInstall(
    esim: Esim
  ) {
    const url =
      getInstallUrl(esim);

    if (url) {
      window.location.href =
        url;
    }
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container">
        <Brand />

        <header className="mt-9">
          <div className="roam-kicker">
            Your connectivity
          </div>

          <h1 className="mt-3 text-[42px] font-black tracking-[-0.055em]">
            Мои eSIM
          </h1>

          <p className="roam-subtitle mt-3">
            Установка, данные
            подключения и статус
            ваших eSIM.
          </p>
        </header>

        {syncing && (
          <div className="roam-card-soft roam-pulse mt-6 p-5">
            <div className="font-bold">
              Подготавливаем eSIM
            </div>

            <div className="mt-1 text-xs text-white/40">
              Получаем профиль
              оператора...
            </div>
          </div>
        )}

        {loading ? (
          <div className="roam-pulse py-20 text-center text-sm text-white/35">
            Загружаем...
          </div>
        ) : !telegramMode ? (
          <div className="roam-card mt-7 p-6">
            <div className="text-xl font-black">
              Откройте WYLD ROAM
              в Telegram
            </div>

            <p className="mt-3 text-sm leading-6 text-white/42">
              Ваши eSIM привязаны
              к Telegram-аккаунту.
            </p>
          </div>
        ) : esims.length ===
          0 ? (
          <div className="roam-card mt-7 p-6">
            <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-cyan-300/[0.09] text-2xl text-cyan-100">
              ◇
            </div>

            <div className="mt-5 text-xl font-black">
              Здесь пока пусто
            </div>

            <p className="mt-2 text-sm leading-6 text-white/42">
              Купленная eSIM
              появится здесь
              автоматически.
            </p>

            <Link
              href="/"
              className="roam-primary mt-6"
            >
              Выбрать eSIM
            </Link>
          </div>
        ) : (
          <div className="mt-7 space-y-5">
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
                    key={esim.id}
                    className="roam-card"
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-white/10 bg-white/[0.055] text-3xl">
                          {getFlagEmoji(
                            esim.country_code
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-xl font-black">
                            {getCountryName(
                              esim.country_code
                            )}
                          </div>

                          <div className="mt-1 truncate text-xs text-white/30">
                            {
                              esim.package_code
                            }
                          </div>
                        </div>

                        <div className="roam-chip">
                          {statusLabel(
                            esim.status
                          )}
                        </div>
                      </div>

                      {(remaining ||
                        expires) && (
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          {remaining && (
                            <div className="roam-stat">
                              <div className="roam-stat-label">
                                Осталось
                              </div>

                              <div className="roam-stat-value">
                                {remaining}
                              </div>
                            </div>
                          )}

                          {expires && (
                            <div className="roam-stat">
                              <div className="roam-stat-label">
                                Действует до
                              </div>

                              <div className="roam-stat-value text-[14px]">
                                {expires}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {esim.status ===
                        "pending" && (
                        <div className="roam-card-soft mt-5 p-4 text-xs leading-5 text-white/42">
                          Профиль уже
                          заказан у
                          оператора.
                          Страница
                          автоматически
                          продолжит
                          получение eSIM.
                        </div>
                      )}

                      {esim.status ===
                        "ready" && (
                        <>
                          {qrIsUrl && (
                            <div className="mt-6 rounded-[26px] bg-white p-5">
                              <div className="text-center">
                                <div className="text-sm font-black text-[#071013]">
                                  QR-код
                                  установки
                                </div>

                                <div className="mt-1 text-[11px] text-black/40">
                                  Отсканируйте
                                  с другого
                                  устройства
                                </div>
                              </div>

                              <img
                                src={
                                  esim.qr_code!
                                }
                                alt="QR-код eSIM"
                                className="mx-auto mt-4 aspect-square w-full max-w-[245px] object-contain"
                              />
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
                              className="roam-primary mt-5"
                            >
                              Установить
                              eSIM
                              <span>→</span>
                            </button>
                          )}

                          <details className="roam-card-soft mt-4 overflow-hidden">
                            <summary className="cursor-pointer list-none p-5 text-sm font-bold">
                              <div className="flex items-center justify-between">
                                <span>
                                  Ручная
                                  установка
                                </span>

                                <span className="text-cyan-100">
                                  +
                                </span>
                              </div>
                            </summary>

                            <div className="border-t border-white/8 px-5 pb-5 pt-4">
                              {esim.smdp_address && (
                                <div className="mb-4">
                                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/28">
                                    SM-DP+
                                  </div>

                                  <div className="mt-2 break-all text-xs leading-5 text-white/65">
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
                                    className="mt-2 text-xs font-bold text-cyan-100"
                                  >
                                    {copied ===
                                    `${esim.id}-smdp`
                                      ? "Скопировано ✓"
                                      : "Скопировать"}
                                  </button>
                                </div>
                              )}

                              {esim.activation_code && (
                                <div className="mb-4 border-t border-white/8 pt-4">
                                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/28">
                                    Код
                                    активации
                                  </div>

                                  <div className="mt-2 break-all text-xs leading-5 text-white/65">
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
                                    className="mt-2 text-xs font-bold text-cyan-100"
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
                                  className="roam-secondary mt-2 min-h-[48px]"
                                >
                                  {copied ===
                                  `${esim.id}-lpa`
                                    ? "Данные скопированы ✓"
                                    : "Скопировать данные установки"}
                                </button>
                              )}
                            </div>
                          </details>

                          {esim.iccid && (
                            <div className="mt-4 px-1">
                              <div className="text-[10px] uppercase tracking-[0.15em] text-white/24">
                                ICCID
                              </div>

                              <div className="mt-1 break-all text-[10px] leading-5 text-white/35">
                                {esim.iccid}
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

        <BottomNav />
      </div>
    </main>
  );
}
