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

  /*
   * 1. При открытии WYLD ROAM
   * внутри Telegram:
   *
   * - активируем Mini App
   * - разворачиваем его
   * - отправляем подписанный initData
   *   на наш сервер
   * - сервер создаёт/обновляет
   *   пользователя в roam_users
   */
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

        const response =
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

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          console.error(
            "Telegram session error:",
            result
          );
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

  /*
   * 2. Загружаем список стран
   * через наш серверный API.
   */
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

        if (
          data.success
        ) {
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

  /*
   * Оставляем только страны.
   *
   * eSIMAccess может возвращать
   * также регионы и вложенные
   * локации.
   */
  const countryLocations =
    useMemo(() => {
      return locations.filter(
        (location) =>
          Boolean(
            location.code
          ) &&
          Boolean(
            location.name
          )
      );
    }, [locations]);

  /*
   * Поиск по названию страны
   * или её коду.
   */
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
        (location) =>
          location.name
            .toLowerCase()
            .includes(
              query
            ) ||
          location.code
            .toLowerCase()
            .includes(
              query
            )
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
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-8">
        {/* BRAND */}

        <div className="text-xs font-semibold uppercase tracking-[0.4em] text-white/35">
          WYLD ROAM
        </div>

        {/* HERO */}

        <section className="mt-7">
          <h1 className="max-w-sm text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">
            Интернет
            <br />
            без границ
          </h1>

          <p className="mt-6 max-w-sm text-base leading-7 text-white/45">
            Выберите страну и
            подключите eSIM за
            несколько минут.
          </p>
        </section>

        {/* SEARCH */}

        <div className="mt-10">
          <input
            type="search"
            value={search}
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
              )
            }
            placeholder="Поиск страны"
            className="h-16 w-full rounded-3xl border border-white/10 bg-white/[0.05] px-6 text-base text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
          />
        </div>

        {/* LOCATIONS */}

        <section className="mt-10">
          {loading ? (
            <div className="py-16 text-center text-sm text-white/35">
              Загружаем направления...
            </div>
          ) : filteredLocations.length ===
            0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="text-lg font-semibold">
                Ничего не найдено
              </div>

              <p className="mt-2 text-sm leading-6 text-white/40">
                Попробуйте изменить
                запрос.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLocations.map(
                (
                  location
                ) => (
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
                    className="flex w-full items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.045] p-5 text-left transition active:scale-[0.985]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xl font-medium">
                        {
                          location.name
                        }
                      </div>

                      <div className="mt-2 text-xs uppercase tracking-[0.15em] text-white/30">
                        {location.continent ??
                          location.code}
                      </div>
                    </div>

                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-black">
                      →
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </section>

        {/* BOTTOM NAV */}

        <nav className="fixed bottom-5 left-1/2 z-30 flex w-[calc(100%-40px)] max-w-sm -translate-x-1/2 rounded-3xl border border-white/10 bg-[#151515]/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-black">
            🌍 eSIM
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/my-esims"
              )
            }
            className="flex h-12 flex-1 items-center justify-center rounded-2xl text-sm text-white/50"
          >
            📱 Мои eSIM
          </button>
        </nav>
      </div>
    </main>
  );
}
