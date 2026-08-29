"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  BottomNav,
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

import {
  getTelegramInitData,
  getTelegramWebApp,
} from "@/lib/telegram-client";

type Location = {
  code: string;
  name: string;
  type: number;
  continent: string | null;
  subLocations: Location[];
};

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

function russianName(
  location: Location
) {
  try {
    if (
      location.code.length === 2
    ) {
      const names =
        new Intl.DisplayNames(
          ["ru"],
          {
            type: "region",
          }
        );

      const translated =
        names.of(
          location.code
        );

      if (translated) {
        return translated;
      }
    }
  } catch {
    // fallback below
  }

  return location.name;
}

export default function Home() {
  const router =
    useRouter();

  const [
    locations,
    setLocations,
  ] = useState<Location[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    isOwner,
    setIsOwner,
  ] = useState(false);

  useEffect(() => {
    async function registerTelegramUser() {
      const webApp =
        getTelegramWebApp();

      const initData =
        getTelegramInitData();

      if (
        !webApp ||
        !initData
      ) {
        return;
      }

      try {
        webApp.ready();
        webApp.expand();

        const sessionResponse =
          await fetch(
            "/api/telegram/session",
            {
              method:
                "POST",

              headers: {
                "x-telegram-init-data":
                  initData,
              },
            }
          );

        const sessionResult =
          await sessionResponse.json();

        if (
          !sessionResponse.ok ||
          !sessionResult.success
        ) {
          console.error(
            "Telegram session error:",
            sessionResult
          );
        }

        const meResponse =
          await fetch(
            "/api/me",
            {
              headers: {
                "x-telegram-init-data":
                  initData,
              },

              cache:
                "no-store",
            }
          );

        const meResult =
          await meResponse.json();

        if (
          meResponse.ok &&
          meResult.success &&
          meResult.isOwner ===
            true
        ) {
          setIsOwner(true);
        }
      } catch (error) {
        console.error(
          "Telegram registration error:",
          error
        );
      }
    }

    registerTelegramUser();
  }, []);

  useEffect(() => {
    async function loadLocations() {
      try {
        const response =
          await fetch(
            "/api/locations",
            {
              cache:
                "no-store",
            }
          );

        const data =
          await response.json();

        if (data.success) {
          setLocations(
            data.locations ??
              []
          );
        }
      } catch (error) {
        console.error(
          "Load locations error:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadLocations();
  }, []);

  const countryLocations =
    useMemo(
      () =>
        locations.filter(
          (location) =>
            Boolean(
              location.code
            ) &&
            Boolean(
              location.name
            )
        ),
      [locations]
    );

  const filteredLocations =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      if (!query) {
        return countryLocations;
      }

      return countryLocations.filter(
        (location) => {
          const translated =
            russianName(
              location
            ).toLowerCase();

          return (
            location.name
              .toLowerCase()
              .includes(query) ||
            translated.includes(
              query
            ) ||
            location.code
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      countryLocations,
      search,
    ]);

  function openCountry(
    location: Location
  ) {
    router.push(
      `/plans/${encodeURIComponent(
        location.code
      )}`
    );
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container">
        <Brand />

        <section className="relative mt-9">
          <div className="roam-kicker">
            Travel connectivity
          </div>

          <h1 className="roam-title mt-4">
            Stay connected.
            <br />
            Anywhere.
          </h1>

          <p className="roam-subtitle mt-5 max-w-[350px]">
            Мобильный интернет
            в путешествиях без
            пластиковой SIM-карты
            и поиска местного
            оператора.
          </p>

          <button
            type="button"
            onClick={() => {
              document
                .getElementById(
                  "destinations"
                )
                ?.scrollIntoView({
                  behavior:
                    "smooth",
                });
            }}
            className="roam-primary mt-7"
          >
            Выбрать eSIM
            <span>→</span>
          </button>
        </section>

        <section className="mt-7 grid grid-cols-3 gap-2">
          <div className="roam-stat">
            <div className="text-xl">
              ◎
            </div>
            <div className="roam-stat-value">
              190+
            </div>
            <div className="roam-stat-label mt-1">
              стран
            </div>
          </div>

          <div className="roam-stat">
            <div className="text-xl">
              ⚡
            </div>
            <div className="roam-stat-value">
              Быстро
            </div>
            <div className="roam-stat-label mt-1">
              выдача
            </div>
          </div>

          <div className="roam-stat">
            <div className="text-xl">
              ◇
            </div>
            <div className="roam-stat-value">
              eSIM
            </div>
            <div className="roam-stat-label mt-1">
              без пластика
            </div>
          </div>
        </section>

        <section
          id="destinations"
          className="mt-10 scroll-mt-6"
        >
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="roam-kicker">
                Destinations
              </div>

              <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">
                Куда летим?
              </h2>
            </div>

            <div className="text-xs text-white/30">
              {countryLocations.length
                ? `${countryLocations.length} направлений`
                : ""}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-white/30">
              ⌕
            </div>

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Найти страну"
              className="roam-search"
            />
          </div>

          {loading ? (
            <div className="roam-pulse py-16 text-center text-sm text-white/35">
              Загружаем направления...
            </div>
          ) : filteredLocations.length ===
            0 ? (
            <div className="roam-card-soft mt-4 p-6">
              <div className="text-lg font-bold">
                Ничего не найдено
              </div>

              <p className="mt-2 text-sm leading-6 text-white/40">
                Попробуйте другое
                название страны.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredLocations.map(
                (location) => {
                  const name =
                    russianName(
                      location
                    );

                  return (
                    <button
                      key={
                        location.code
                      }
                      type="button"
                      onClick={() =>
                        openCountry(
                          location
                        )
                      }
                      className="roam-glass flex w-full items-center gap-4 rounded-[24px] p-4 text-left transition active:scale-[0.985]"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.055] text-3xl">
                        {getFlagEmoji(
                          location.code
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[17px] font-bold">
                          {name}
                        </div>

                        <div className="mt-1 text-xs uppercase tracking-[0.13em] text-white/30">
                          {location.continent ??
                            location.code}
                        </div>
                      </div>

                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-cyan-200/10 bg-cyan-300/[0.07] text-lg text-cyan-100">
                        →
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </section>

        <section className="roam-card mt-10 p-6">
          <div className="roam-kicker">
            How it works
          </div>

          <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em]">
            Три простых шага
          </h2>

          <div className="mt-6 space-y-5">
            {[
              [
                "01",
                "Выберите страну",
                "Найдите направление и подходящий объём интернета.",
              ],
              [
                "02",
                "Оплатите в Telegram",
                "Покупка проходит через Telegram Stars.",
              ],
              [
                "03",
                "Установите eSIM",
                "QR-код и данные установки появятся автоматически.",
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
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-cyan-200/10 bg-cyan-300/[0.07] text-xs font-black text-cyan-100">
                    {number}
                  </div>

                  <div>
                    <div className="text-sm font-bold">
                      {title}
                    </div>

                    <div className="mt-1 text-xs leading-5 text-white/38">
                      {text}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </section>

        <BottomNav
          isOwner={isOwner}
        />
      </div>
    </main>
  );
}
