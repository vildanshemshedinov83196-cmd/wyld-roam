"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BackButton,
  Brand,
  BottomNav,
  RoamBackground,
} from "@/components/roam-ui";

type TopupPackage = {
  packageCode: string;
  slug: string;
  name: string;
  dataLabel: string;
  durationLabel: string;
  amount: number;
  currency: string;
  networks: string[];
  countryCode?: string | null;
};

type TelegramWebApp = {
  initData?: string;

  ready?: () => void;

  expand?: () => void;

  openInvoice?: (
    url: string,
    callback?: (
      status:
        | "paid"
        | "cancelled"
        | "failed"
        | "pending"
    ) => void
  ) => void;

  openTelegramLink?: (
    url: string
  ) => void;
};

function telegram():
  TelegramWebApp | null {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  return (
    window as typeof window & {
      Telegram?: {
        WebApp?: TelegramWebApp;
      };
    }
  ).Telegram?.WebApp ?? null;
}

function flag(
  code?: string | null
) {
  if (
    !code ||
    code.length !== 2
  ) {
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

function sleep(ms: number) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

export default function TopupPage() {
  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    packages,
    setPackages,
  ] = useState<
    TopupPackage[]
  >([]);

  const [
    countryCode,
    setCountryCode,
  ] =
    useState<
      string | null
    >(null);

  const [
    buyingSlug,
    setBuyingSlug,
  ] =
    useState<
      string | null
    >(null);

  const [
    success,
    setSuccess,
  ] = useState(false);

  const [
    statusMessage,
    setStatusMessage,
  ] = useState("");

  const esimId =
    useMemo(() => {
      if (
        typeof window ===
        "undefined"
      ) {
        return "";
      }

      return (
        new URLSearchParams(
          window.location.search
        ).get("esim") ?? ""
      );
    }, []);

  useEffect(() => {
    const load =
      async () => {
        try {
          const tg =
            telegram();

          tg?.ready?.();
          tg?.expand?.();

          if (!esimId) {
            throw new Error(
              "Не выбрана eSIM"
            );
          }

          const initData =
            tg?.initData ?? "";

          if (!initData) {
            throw new Error(
              "Открой WYLD ROAM внутри Telegram"
            );
          }

          const response =
            await fetch(
              "/api/esim/topups",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    initData,
                    esimId,
                  }),
              }
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data.ok
          ) {
            throw new Error(
              data?.error ||
                "Не удалось загрузить пакеты"
            );
          }

          setPackages(
            Array.isArray(
              data.packages
            )
              ? data.packages
              : []
          );

          setCountryCode(
            data?.esim
              ?.countryCode ??
              null
          );
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Ошибка загрузки"
          );
        } finally {
          setLoading(
            false
          );
        }
      };

    load();
  }, [esimId]);

  const pollStatus =
    async (
      topupId: string
    ) => {
      const tg =
        telegram();

      const initData =
        tg?.initData ?? "";

      for (
        let attempt = 0;
        attempt < 20;
        attempt++
      ) {
        const response =
          await fetch(
            "/api/topups/status",
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
                  topupId,
                }),
            }
          );

        const data =
          await response.json();

        const status =
          data?.topup?.status;

        if (
          status ===
          "completed"
        ) {
          setSuccess(true);
          setStatusMessage(
            "Интернет успешно добавлен"
          );
          return;
        }

        if (
          status ===
          "failed"
        ) {
          throw new Error(
            data?.topup
              ?.last_error ||
              "Не удалось выполнить Top Up"
          );
        }

        if (
          status ===
          "processing"
        ) {
          setStatusMessage(
            "Пополняем eSIM…"
          );
        } else if (
          status === "paid"
        ) {
          setStatusMessage(
            "Оплата получена. Запускаем Top Up…"
          );
        } else {
          setStatusMessage(
            "Ждём подтверждение оплаты…"
          );
        }

        await sleep(
          1500
        );
      }

      setStatusMessage(
        "Оплата получена. Пополнение ещё обрабатывается."
      );
    };

  const buy =
    async (
      plan: TopupPackage
    ) => {
      if (buyingSlug) {
        return;
      }

      setError("");
      setSuccess(false);
      setBuyingSlug(
        plan.slug
      );
      setStatusMessage(
        "Создаём Top Up…"
      );

      try {
        const tg =
          telegram();

        const initData =
          tg?.initData ?? "";

        if (
          !tg ||
          !initData
        ) {
          throw new Error(
            "Открой WYLD ROAM внутри Telegram"
          );
        }

        /*
         * Шаг 1.
         * Сервер повторно проверяет
         * настоящий пакет и цену
         * у eSIMAccess.
         */
        const createResponse =
          await fetch(
            "/api/topups/create",
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
                  esimId,
                  slug:
                    plan.slug,
                }),
            }
          );

        const created =
          await createResponse.json();

        if (
          !createResponse.ok ||
          !created.success ||
          !created?.topup?.id
        ) {
          throw new Error(
            created?.error ||
              "Не удалось создать Top Up"
          );
        }

        const topupId =
          created.topup.id;

        setStatusMessage(
          "Создаём счёт Telegram Stars…"
        );

        /*
         * Шаг 2.
         * Создаём Stars invoice.
         */
        const invoiceResponse =
          await fetch(
            "/api/payments/stars/topup",
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
                  topupId,
                }),
            }
          );

        const invoice =
          await invoiceResponse.json();

        if (
          !invoiceResponse.ok ||
          !invoice.success ||
          !invoice.invoiceUrl
        ) {
          throw new Error(
            invoice?.error ||
              "Не удалось создать оплату"
          );
        }

        setStatusMessage(
          `К оплате ${invoice.starsAmount} ⭐`
        );

        if (!tg.openInvoice) {
          throw new Error(
            "Telegram Stars недоступны"
          );
        }

        /*
         * Шаг 3.
         * Telegram сам показывает
         * системное окно оплаты.
         */
        tg.openInvoice(
          invoice.invoiceUrl,
          async (
            invoiceStatus
          ) => {
            if (
              invoiceStatus ===
              "cancelled"
            ) {
              setStatusMessage(
                "Оплата отменена"
              );
              setBuyingSlug(
                null
              );
              return;
            }

            if (
              invoiceStatus ===
              "failed"
            ) {
              setError(
                "Telegram не смог провести оплату"
              );
              setBuyingSlug(
                null
              );
              return;
            }

            try {
              await pollStatus(
                topupId
              );
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Ошибка Top Up"
              );
            } finally {
              setBuyingSlug(
                null
              );
            }
          }
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Ошибка Top Up"
        );

        setBuyingSlug(
          null
        );
      }
    };

  if (success) {
    return (
      <main className="roam-page">
        <RoamBackground />

        <div className="roam-container">
          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "space-between",
              marginBottom:
                30,
            }}
          >
            <BackButton href="/my-esims" />
            <Brand />
            <div
              style={{
                width: 42,
              }}
            />
          </div>

          <section
            className="roam-card"
            style={{
              textAlign:
                "center",

              paddingTop:
                42,

              paddingBottom:
                42,
            }}
          >
            <div
              style={{
                fontSize: 58,
                marginBottom:
                  18,
              }}
            >
              ✓
            </div>

            <div
              className="roam-chip"
              style={{
                width:
                  "fit-content",
                margin:
                  "0 auto 16px",
              }}
            >
              ГОТОВО
            </div>

            <h1
              className="roam-title"
              style={{
                marginBottom:
                  12,
              }}
            >
              Интернет добавлен
            </h1>

            <p className="roam-subtitle">
              Пакет подключён к
              существующей eSIM.
              Переустанавливать её
              не нужно.
            </p>

            <Link
              href="/my-esims"
              className="roam-primary-button"
              style={{
                display:
                  "flex",
                marginTop:
                  26,
                textDecoration:
                  "none",
              }}
            >
              Мои eSIM
              <span>→</span>
            </Link>
          </section>

          <BottomNav />
        </div>
      </main>
    );
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container">
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap: 12,
            marginBottom:
              30,
          }}
        >
          <BackButton href="/my-esims" />
          <Brand />
          <div
            style={{
              width: 42,
            }}
          />
        </div>

        <section
          className="roam-card"
          style={{
            marginBottom:
              18,
          }}
        >
          <div
            style={{
              fontSize: 50,
              marginBottom:
                12,
            }}
          >
            {flag(
              countryCode
            )}
          </div>

          <div
            className="roam-chip"
            style={{
              width:
                "fit-content",
              marginBottom:
                14,
            }}
          >
            TOP UP
          </div>

          <h1
            className="roam-title"
            style={{
              marginBottom:
                10,
            }}
          >
            Добавить интернет
          </h1>

          <p className="roam-subtitle">
            Продолжай пользоваться
            той же eSIM. Новый
            QR-код устанавливать
            не нужно.
          </p>
        </section>

        {loading && (
          <section className="roam-card">
            Загружаем пакеты…
          </section>
        )}

        {error && (
          <section className="roam-card roam-error">
            {error}
          </section>
        )}

        {statusMessage &&
          !error && (
            <section
              className="roam-card-soft"
              style={{
                marginBottom:
                  14,
              }}
            >
              {statusMessage}
            </section>
          )}

        {!loading &&
          !error &&
          packages.length ===
            0 && (
            <section className="roam-card">
              Для этой eSIM
              сейчас нет доступных
              Top Up-пакетов.
            </section>
          )}

        {!loading &&
          packages.length >
            0 && (
            <>
              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "space-between",

                  alignItems:
                    "end",

                  margin:
                    "26px 2px 14px",
                }}
              >
                <div>
                  <div
                    className="roam-chip"
                    style={{
                      width:
                        "fit-content",
                      marginBottom:
                        8,
                    }}
                  >
                    ДОСТУПНО
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontSize:
                        25,
                    }}
                  >
                    Выбери пакет
                  </h2>
                </div>

                <span
                  style={{
                    opacity:
                      0.55,

                    fontSize:
                      13,
                  }}
                >
                  {
                    packages.length
                  }{" "}
                  вариантов
                </span>
              </div>

              <div
                style={{
                  display:
                    "grid",
                  gap: 12,
                }}
              >
                {packages.map(
                  (plan) => {
                    const busy =
                      buyingSlug ===
                      plan.slug;

                    return (
                      <article
                        key={
                          plan.slug
                        }
                        className="roam-card"
                      >
                        <div
                          style={{
                            display:
                              "flex",

                            justifyContent:
                              "space-between",

                            alignItems:
                              "flex-start",

                            gap: 18,
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize:
                                  27,

                                fontWeight:
                                  800,
                              }}
                            >
                              {
                                plan.dataLabel
                              }
                            </div>

                            <div
                              style={{
                                marginTop:
                                  6,

                                opacity:
                                  0.65,

                                fontSize:
                                  14,
                              }}
                            >
                              {
                                plan.durationLabel
                              }
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign:
                                "right",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  25,

                                fontWeight:
                                  800,
                              }}
                            >
                              $
                              {plan.amount.toFixed(
                                2
                              )}
                            </div>

                            <div
                              style={{
                                marginTop:
                                  5,

                                opacity:
                                  0.48,

                                fontSize:
                                  12,
                              }}
                            >
                              USD
                            </div>
                          </div>
                        </div>

                        {plan.networks
                          .length >
                          0 && (
                          <div
                            style={{
                              display:
                                "flex",

                              flexWrap:
                                "wrap",

                              gap: 7,

                              marginTop:
                                17,
                            }}
                          >
                            {plan.networks.map(
                              (
                                network
                              ) => (
                                <span
                                  key={
                                    network
                                  }
                                  className="roam-chip"
                                >
                                  {
                                    network
                                  }
                                </span>
                              )
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={
                            Boolean(
                              buyingSlug
                            )
                          }
                          onClick={() =>
                            buy(
                              plan
                            )
                          }
                          className="roam-primary-button"
                          style={{
                            width:
                              "100%",

                            marginTop:
                              18,

                            opacity:
                              buyingSlug &&
                              !busy
                                ? 0.45
                                : 1,
                          }}
                        >
                          {busy
                            ? "Подготавливаем…"
                            : `Пополнить · $${plan.amount.toFixed(
                                2
                              )}`}
                        </button>
                      </article>
                    );
                  }
                )}
              </div>
            </>
          )}

        <Link
          href="/my-esims"
          className="roam-secondary-button"
          style={{
            display:
              "block",

            width:
              "100%",

            textAlign:
              "center",

            marginTop:
              18,
          }}
        >
          Вернуться к моим eSIM
        </Link>

        <BottomNav />
      </div>
    </main>
  );
}
