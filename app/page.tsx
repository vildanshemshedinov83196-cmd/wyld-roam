"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Location = {
  code: string;
  name: string;
  type: number;
  continent: string | null;
  subLocations: Location[];
};

export default function Home() {
  const router = useRouter();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadLocations() {
      try {
        const response = await fetch("/api/locations");
        const data = await response.json();

        if (data.success) {
          setLocations(data.locations ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    loadLocations();
  }, []);

  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return locations;
    }

    return locations.filter((location) => {
      return (
        location.name.toLowerCase().includes(query) ||
        location.code.toLowerCase().includes(query) ||
        location.continent?.toLowerCase().includes(query)
      );
    });
  }, [locations, search]);

  function openLocation(code: string) {
    router.push(`/plans/${code}`);
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-8">
        <header className="mb-8">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
            WYLD ROAM
          </div>

          <h1 className="text-4xl font-semibold leading-tight">
            Интернет
            <br />
            без границ.
          </h1>

          <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">
            Выберите страну и подключите eSIM за несколько минут.
          </p>
        </header>

        <div className="sticky top-0 z-10 -mx-5 mb-6 bg-[#050505]/95 px-5 pb-4 pt-2 backdrop-blur">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск страны"
              className="h-14 w-full bg-transparent text-base text-white outline-none placeholder:text-white/30"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-white/40">
            Загружаем направления...
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLocations.map((location) => (
              <button
                key={location.code}
                onClick={() => openLocation(location.code)}
                className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-white/[0.05] px-5 py-5 text-left transition active:scale-[0.98]"
              >
                <div>
                  <div className="text-lg font-medium">
                    {location.name}
                  </div>

                  <div className="mt-1 text-xs uppercase tracking-wider text-white/35">
                    {location.continent ?? "Global"}
                  </div>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-black">
                  →
                </div>
              </button>
            ))}

            {filteredLocations.length === 0 && (
              <div className="py-12 text-center text-sm text-white/40">
                Ничего не найдено
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
