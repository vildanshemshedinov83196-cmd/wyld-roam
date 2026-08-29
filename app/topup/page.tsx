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
};

function getTelegram():
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

function countryFlag(
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

function sleep(
  ms: number
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

export default function TopupPage() {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    packages,
    setPackages,
  ] = useState<
    TopupPackage[]
  >([]);

  const [
    countryCode,
    setCountryCode,
  ] = useState<
    string | null
  >(null);

  const [
    buyingSlug,
    setBuyingSlug,
  ] = useState<
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
            getTelegram();

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
          setLoading(false);
        }
      };

    load();
  }, [esimId]);

  const pollStatus =
    async (
      topupId: string
    ) => {
      const tg =
        getTelegram();

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
            "Добавляем интернет на eSIM…"
          );
        } else if (
          status === "paid"
        ) {
          setStatusMessage(
            "Оплата получена. Подключаем пакет…"
          );
        } else {
          setStatusMessage(
            "Ждём подтверждение оплаты…"
          );
        }

        await sleep(1500);
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
        "Подготавливаем пакет…"
      );

      try {
        const tg =
          getTelegram();

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
                ""
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

        setStatusMessage("");

        setBuyingSlug(
          null
        );
      }
    };

  if (success) {
    return (
      <main className="roam-page">
        <RoamBackground />

        <div
          className="roam-container"
          style={{
            paddingBottom:
              "180px",
          }}
        >
          <header
            style={{
              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "space-between",

              marginBottom:
                20,
            }}
          >
            <BackButton href="/my-esims" />

            <Brand />

            <div
              style={{
                width: 42,
              }}
            />
          </header>

          <section
            className="roam-card"
            style={{
              padding:
                "36px 22px",

              textAlign:
                "center",

              borderRadius:
                28,
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,

                display:
                  "grid",

                placeItems:
                  "center",

                margin:
                  "0 auto 20px",

                borderRadius:
                  24,

                fontSize:
                  34,

                fontWeight:
                  900,

                color:
                  "#071012",

                background:
                  "linear-gradient(135deg, #7bf7ff 0%, #5a8cff 100%)",

                boxShadow:
                  "0 18px 55px rgba(94, 219, 255, .22)",
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
                  "0 auto 13px",
              }}
            >
              ГОТОВО
            </div>

            <h1
              style={{
                margin:
                  "0 0 10px",

                fontSize:
                  "clamp(30px, 8vw, 42px)",

                lineHeight:
                  1.02,

                letterSpacing:
                  "-0.04em",
              }}
            >
              Интернет добавлен
            </h1>

            <p
              style={{
                margin:
                  "0 auto",

                maxWidth:
                  390,

                color:
                  "rgba(255,255,255,.58)",

                fontSize:
                  15,

                lineHeight:
                  1.55,
              }}
            >
              Пакет подключён к
              существующей eSIM.
              Ничего
              переустанавливать
              не нужно.
            </p>

            <Link
              href="/my-esims"
              className="roam-primary-button"
              style={{
                display:
                  "flex",

                width:
                  "100%",

                marginTop:
                  24,

                textDecoration:
                  "none",
              }}
            >
              Перейти к eSIM
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

      <div
        className="roam-container"
        style={{
          paddingBottom:
            "190px",
        }}
      >
        <header
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap: 12,

            marginBottom:
              16,
          }}
        >
          <BackButton href="/my-esims" />

          <Brand />

          <div
            style={{
              width: 42,
            }}
          />
        </header>

        <section
          className="roam-card"
          style={{
            position:
              "relative",

            overflow:
              "hidden",

            padding:
              "20px",

            borderRadius:
              28,

            marginBottom:
              24,

            background:
              "linear-gradient(145deg, rgba(18,39,44,.94), rgba(7,10,12,.96) 62%)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position:
                "absolute",

              width: 180,
              height: 180,

              right: -70,
              top: -75,

              borderRadius:
                "999px",

              background:
                "rgba(79,232,255,.12)",

              filter:
                "blur(35px)",

              pointerEvents:
                "none",
            }}
          />

          <div
            style={{
              position:
                "relative",

              display:
                "flex",

              alignItems:
                "flex-start",

              justifyContent:
                "space-between",

              gap: 16,
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: 9,

                  marginBottom:
                    16,
                }}
              >
                <div
                  style={{
                    fontSize:
                      27,

                    lineHeight:
                      1,
                  }}
                >
                  {countryFlag(
                    countryCode
                  )}
                </div>

                <div
                  className="roam-chip"
                  style={{
                    width:
                      "fit-content",
                  }}
                >
                  TOP UP
                </div>
              </div>

              <h1
                style={{
                  margin:
                    "0 0 9px",

                  maxWidth:
                    330,

                  fontSize:
                    "clamp(30px, 8.8vw, 44px)",

                  lineHeight:
                    0.98,

                  letterSpacing:
                    "-0.045em",

                  fontWeight:
                    800,
                }}
              >
                Добавить интернет
              </h1>

              <p
                style={{
                  margin: 0,

                  maxWidth:
                    350,

                  color:
                    "rgba(255,255,255,.54)",

                  fontSize:
                    14,

                  lineHeight:
                    1.5,
                }}
              >
                Новый пакет
                подключится к той
                же eSIM. Повторная
                установка не нужна.
              </p>
            </div>
          </div>
        </section>

        <div
          style={{
            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "flex-end",

            gap: 14,

            margin:
              "0 2px 14px",
          }}
        >
          <div>
            <div
              style={{
                color:
                  "#75f6ff",

                fontSize:
                  11,

                fontWeight:
                  800,

                letterSpacing:
                  ".13em",

                marginBottom:
                  7,
              }}
            >
              ДОСТУПНЫЕ ПАКЕТЫ
            </div>

            <h2
              style={{
                margin: 0,

                fontSize:
                  26,

                lineHeight:
                  1,

                letterSpacing:
                  "-0.035em",
              }}
            >
              Выбери объём
            </h2>
          </div>

          {!loading &&
            packages.length >
              0 && (
              <div
                style={{
                  flexShrink:
                    0,

                  color:
                    "rgba(255,255,255,.43)",

                  fontSize:
                    13,
                }}
              >
                {
                  packages.length
                }{" "}
                вариантов
              </div>
            )}
        </div>

        {loading && (
          <section
            className="roam-card"
            style={{
              padding:
                "20px",

              borderRadius:
                24,

              color:
                "rgba(255,255,255,.65)",
            }}
          >
            Загружаем доступные
            пакеты…
          </section>
        )}

        {error && (
          <section
            className="roam-card"
            style={{
              padding:
                "18px 20px",

              borderRadius:
                22,

              border:
                "1px solid rgba(255,100,100,.18)",

              color:
                "#ffb1b1",
            }}
          >
            {error}
          </section>
        )}

        {statusMessage &&
          !error && (
            <section
              className="roam-card-soft"
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                gap: 10,

                padding:
                  "14px 16px",

                marginBottom:
                  14,

                borderRadius:
                  19,

                fontSize:
                  14,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,

                  flexShrink:
                    0,

                  borderRadius:
                    99,

                  background:
                    "#75f6ff",

                  boxShadow:
                    "0 0 18px rgba(117,246,255,.7)",
                }}
              />

              {statusMessage}
            </section>
          )}

        {!loading &&
          !error &&
          packages.length ===
            0 && (
            <section
              className="roam-card"
              style={{
                padding:
                  "22px",

                borderRadius:
                  24,
              }}
            >
              Для этой eSIM
              сейчас нет доступных
              пакетов пополнения.
            </section>
          )}

        {!loading &&
          packages.length >
            0 && (
            <div
              style={{
                display:
                  "grid",

                gap: 11,
              }}
            >
              {packages.map(
                (plan) => {
                  const busy =
                    buyingSlug ===
                    plan.slug;

                  const anotherBusy =
                    Boolean(
                      buyingSlug
                    ) &&
                    !busy;

                  return (
                    <article
                      key={
                        plan.slug
                      }
                      className="roam-card"
                      style={{
                        padding:
                          "18px",

                        borderRadius:
                          25,

                        opacity:
                          anotherBusy
                            ? 0.55
                            : 1,

                        transition:
                          "opacity .2s ease, transform .2s ease",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "grid",

                          gridTemplateColumns:
                            "1fr auto",

                          alignItems:
                            "start",

                          gap: 16,
                        }}
                      >
                        <div
                          style={{
                            minWidth:
                              0,
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                31,

                              lineHeight:
                                1,

                              fontWeight:
                                850,

                              letterSpacing:
                                "-0.045em",
                            }}
                          >
                            {
                              plan.dataLabel
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                7,

                              color:
                                "rgba(255,255,255,.48)",

                              fontSize:
                                13,
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

                            flexShrink:
                              0,
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                28,

                              lineHeight:
                                1,

                              fontWeight:
                                850,

                              letterSpacing:
                                "-0.04em",
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
                                6,

                              color:
                                "rgba(255,255,255,.32)",

                              fontSize:
                                11,

                              letterSpacing:
                                ".08em",
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

                            gap: 6,

                            marginTop:
                              14,
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
                                style={{
                                  display:
                                    "inline-flex",

                                  alignItems:
                                    "center",

                                  minHeight:
                                    28,

                                  padding:
                                    "0 10px",

                                  borderRadius:
                                    999,

                                  border:
                                    "1px solid rgba(117,246,255,.13)",

                                  background:
                                    "rgba(117,246,255,.055)",

                                  color:
                                    "rgba(159,247,255,.88)",

                                  fontSize:
                                    11,

                                  fontWeight:
                                    700,
                                }}
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
                          buy(plan)
                        }
                        style={{
                          width:
                            "100%",

                          minHeight:
                            50,

                          marginTop:
                            15,

                          padding:
                            "0 17px",

                          display:
                            "flex",

                          alignItems:
                            "center",

                          justifyContent:
                            "space-between",

                          gap: 10,

                          border: 0,

                          borderRadius:
                            17,

                          cursor:
                            buyingSlug
                              ? "default"
                              : "pointer",

                          color:
                            "#061011",

                          background:
                            "linear-gradient(135deg, #79f7ff 0%, #5a8cff 100%)",

                          fontSize:
                            14,

                          fontWeight:
                            850,

                          letterSpacing:
                            "-0.01em",

                          boxShadow:
                            "0 12px 28px rgba(91,181,255,.13)",

                          opacity:
                            anotherBusy
                              ? 0.6
                              : 1,
                        }}
                      >
                        <span>
                          {busy
                            ? "Подготавливаем…"
                            : "Пополнить eSIM"}
                        </span>

                        <span
                          style={{
                            display:
                              "flex",

                            alignItems:
                              "center",

                            gap: 7,

                            fontSize:
                              15,
                          }}
                        >
                          {busy
                            ? "•••"
                            : `$${plan.amount.toFixed(
                                2
                              )}  →`}
                        </span>
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          )}

        <div
          style={{
            marginTop:
              16,

            textAlign:
              "center",
          }}
        >
          <Link
            href="/my-esims"
            style={{
              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              minHeight:
                42,

              padding:
                "0 16px",

              borderRadius:
                999,

              color:
                "rgba(255,255,255,.5)",

              textDecoration:
                "none",

              fontSize:
                13,
            }}
          >
            ← Вернуться к моим eSIM
          </Link>
        </div>

        <BottomNav />
      </div>
    </main>
  );
}
