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
  duration?: number;
  durationUnit?: string;
  amount: number;
  currency: string;
  networks: string[];
  speed?: string | null;
  countryCode?: string | null;
};

function getTelegram() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window as typeof window & {
      Telegram?: {
        WebApp?: {
          initData?: string;
          ready?: () => void;
          expand?: () => void;
        };
      };
    }
  ).Telegram?.WebApp;
}

function flag(code?: string | null) {
  if (!code || code.length !== 2) {
    return "🌍";
  }

  return code
    .toUpperCase()
    .replace(
      /./g,
      (char) =>
        String.fromCodePoint(
          127397 + char.charCodeAt(0)
        )
    );
}

export default function TopupPage() {
  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [packages, setPackages] =
    useState<TopupPackage[]>([]);

  const [countryCode, setCountryCode] =
    useState<string | null>(null);

  const esimId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(
      window.location.search
    ).get("esim") ?? "";
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const telegram = getTelegram();

        telegram?.ready?.();
        telegram?.expand?.();

        if (!esimId) {
          throw new Error(
            "Не выбрана eSIM для пополнения"
          );
        }

        const initData =
          telegram?.initData ?? "";

        if (!initData) {
          throw new Error(
            "Открой WYLD ROAM внутри Telegram"
          );
        }

        const response = await fetch(
          "/api/esim/topups",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              initData,
              esimId,
            }),
          }
        );

        const data =
          await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data?.error ||
              "Не удалось загрузить пополнения"
          );
        }

        setPackages(
          Array.isArray(data.packages)
            ? data.packages
            : []
        );

        setCountryCode(
          data?.esim?.countryCode ?? null
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить пополнения"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [esimId]);

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 30,
          }}
        >
          <BackButton href="/my-esims" />
          <Brand />
          <div style={{ width: 42 }} />
        </div>

        <section
          className="roam-card"
          style={{
            marginBottom: 18,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              fontSize: 50,
              marginBottom: 12,
            }}
          >
            {flag(countryCode)}
          </div>

          <div
            className="roam-chip"
            style={{
              width: "fit-content",
              marginBottom: 14,
            }}
          >
            TOP UP
          </div>

          <h1
            className="roam-title"
            style={{
              marginBottom: 10,
            }}
          >
            Добавить интернет
          </h1>

          <p className="roam-subtitle">
            Продолжай пользоваться той же
            eSIM. Новый QR-код устанавливать
            не нужно.
          </p>
        </section>

        {loading && (
          <section className="roam-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div className="roam-pulse" />
              <span>
                Ищем доступные пакеты…
              </span>
            </div>
          </section>
        )}

        {error && (
          <section
            className="roam-card roam-error"
          >
            {error}
          </section>
        )}

        {!loading &&
          !error &&
          packages.length === 0 && (
            <section className="roam-card">
              <h2
                style={{
                  marginTop: 0,
                  marginBottom: 8,
                }}
              >
                Пополнение недоступно
              </h2>

              <p
                className="roam-subtitle"
                style={{ margin: 0 }}
              >
                Для этой eSIM поставщик
                сейчас не предлагает
                совместимые Top Up-пакеты.
              </p>
            </section>
          )}

        {!loading &&
          !error &&
          packages.length > 0 && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "end",
                  gap: 12,
                  margin: "26px 2px 14px",
                }}
              >
                <div>
                  <div
                    className="roam-chip"
                    style={{
                      width: "fit-content",
                      marginBottom: 8,
                    }}
                  >
                    ДОСТУПНО
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 25,
                    }}
                  >
                    Выбери пакет
                  </h2>
                </div>

                <span
                  style={{
                    opacity: 0.55,
                    fontSize: 13,
                  }}
                >
                  {packages.length} вариантов
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                }}
              >
                {packages.map((plan) => (
                  <article
                    key={plan.slug}
                    className="roam-card"
                  >
                    <div
                      style={{
                        display: "flex",
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
                            fontSize: 27,
                            fontWeight: 800,
                            letterSpacing:
                              "-0.03em",
                          }}
                        >
                          {plan.dataLabel}
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            opacity: 0.65,
                            fontSize: 14,
                          }}
                        >
                          {plan.durationLabel}
                        </div>
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 25,
                            fontWeight: 800,
                          }}
                        >
                          $
                          {plan.amount.toFixed(
                            2
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            opacity: 0.48,
                            fontSize: 12,
                          }}
                        >
                          USD
                        </div>
                      </div>
                    </div>

                    {plan.networks.length >
                      0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 7,
                          marginTop: 17,
                        }}
                      >
                        {plan.networks.map(
                          (network) => (
                            <span
                              key={network}
                              className="roam-chip"
                            >
                              {network}
                            </span>
                          )
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="roam-primary-button"
                      style={{
                        width: "100%",
                        marginTop: 18,
                        opacity: 0.72,
                        cursor: "default",
                      }}
                      onClick={() => {
                        alert(
                          `Пакет ${plan.dataLabel} выбран.\n\nНа следующем этапе подключим оплату Telegram Stars и автоматический Top Up. Сейчас деньги НЕ списываются.`
                        );
                      }}
                    >
                      Выбрать · $
                      {plan.amount.toFixed(2)}
                    </button>
                  </article>
                ))}
              </div>

              <section
                className="roam-card-soft"
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  lineHeight: 1.6,
                  opacity: 0.72,
                }}
              >
                На этом этапе экран работает
                в безопасном режиме:
                WYLD ROAM получает настоящие
                доступные пакеты eSIMAccess,
                но Top Up ещё не покупает.
              </section>
            </>
          )}

        <div style={{ height: 20 }} />

        <Link
          href="/my-esims"
          className="roam-secondary-button"
          style={{
            width: "100%",
            textAlign: "center",
            display: "block",
          }}
        >
          Вернуться к моим eSIM
        </Link>

        <BottomNav />
      </div>
    </main>
  );
}
