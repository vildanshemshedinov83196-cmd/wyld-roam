"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Plan = {
  packageCode: string;
  name: string;
  data: string;
  volumeBytes: number;
  duration: number;
  durationUnit: string;
  speed: string;
  retailPrice: number;
  currency: string;
  fupPolicy: string;
  dataType: number;
  topUpSupported: boolean;
  operators: Array<{
    name: string;
    network: string;
  }>;
};

type Location = {
  code: string;
  name: string;
  type: number;
  continent: string | null;
  subLocations: Location[];
};

function getFlagEmoji(code: string) {
  if (code.length !== 2) {
    return "🌍";
  }

  return code
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    );
}

function durationLabel(duration: number, unit: string) {
  if (unit !== "DAY") {
    return `${duration} ${unit}`;
  }

  if (duration === 1) {
    return "1 день";
  }

  if (duration >= 2 && duration <= 4) {
    return `${duration} дня`;
  }

  return `${duration} дней`;
}

function findLocation(
  locations: Location[],
  code: string
): Location | null {
  for (const location of locations) {
    if (location.code === code) {
      return location;
    }

    if (location.subLocations?.length) {
      const nested = findLocation(
        location.subLocations,
        code
      );

      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function getRussianLocationName(
  code: string,
  fallbackName: string
) {
  try {
    if (code.length === 2) {
      const displayNames = new Intl.DisplayNames(
        ["ru"],
        { type: "region" }
      );

      const translated =
        displayNames.of(code);

      if (
        translated &&
        translated.toUpperCase() !== code
      ) {
        return translated;
      }
    }
  } catch {
    // Если браузер не смог перевести,
    // используем название eSIMAccess.
  }

  return fallbackName;
}

export default function PlansPage() {
  const params = useParams();
  const router = useRouter();

  const code = String(
    params.code ?? ""
  ).toUpperCase();

  const [plans, setPlans] =
    useState<Plan[]>([]);

  const [locations, setLocations] =
    useState<Location[]>([]);

  const [loadingPlans, setLoadingPlans] =
    useState(true);

  const [
    loadingLocations,
    setLoadingLocations,
  ] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      try {
        const response = await fetch(
          `/api/plans?country=${encodeURIComponent(
            code
          )}`
        );

        const data =
          await response.json();

        if (data.success) {
          setPlans(data.plans ?? []);
        }
      } finally {
        setLoadingPlans(false);
      }
    }

    if (code) {
      loadPlans();
    }
  }, [code]);

  useEffect(() => {
    async function loadLocations() {
      try {
        const response =
          await fetch("/api/locations");

        const data =
          await response.json();

        if (data.success) {
          setLocations(
            data.locations ?? []
          );
        }
      } finally {
        setLoadingLocations(false);
      }
    }

    loadLocations();
  }, []);

  const regularPlans =
    useMemo(() => {
      return plans
        .filter(
          (plan) =>
            plan.dataType !== 2
        )
        .sort((a, b) => {
          if (
            a.volumeBytes !==
            b.volumeBytes
          ) {
            return (
              a.volumeBytes -
              b.volumeBytes
            );
          }

          return (
            a.duration - b.duration
          );
        });
    }, [plans]);

  const dailyPlans =
    useMemo(() => {
      return plans
        .filter(
          (plan) =>
            plan.dataType === 2
        )
        .sort(
          (a, b) =>
            a.volumeBytes -
            b.volumeBytes
        );
    }, [plans]);

  const currentLocation =
    useMemo(() => {
      return findLocation(
        locations,
        code
      );
    }, [locations, code]);

  const locationName =
    useMemo(() => {
      if (!currentLocation) {
        return code;
      }

      return getRussianLocationName(
        code,
        currentLocation.name
      );
    }, [currentLocation, code]);

  const flag =
    getFlagEmoji(code);

  const loading =
    loadingPlans ||
    loadingLocations;

  function renderPlan(
    plan: Plan,
    daily = false
  ) {
    return (
<button
  key={plan.packageCode}
  onClick={() =>
    router.push(
      `/checkout?package=${encodeURIComponent(
        plan.packageCode
      )}&country=${encodeURIComponent(code)}`
    )
  }
  className="w-full rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition active:scale-[0.98]"
>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">
              {daily
                ? `${plan.data} / день`
                : plan.data}
            </div>

            <div className="mt-1 text-sm text-white/45">
              {daily
                ? "Дневной пакет"
                : durationLabel(
                    plan.duration,
                    plan.durationUnit
                  )}
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-semibold">
              $
              {plan.retailPrice.toFixed(
                2
              )}
            </div>

            <div className="mt-1 text-xs text-white/35">
              {plan.currency}
            </div>
          </div>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <div className="space-y-2 text-sm text-white/55">
          {plan.speed && (
            <div>
              Скорость: {plan.speed}
            </div>
          )}

          {plan.operators.length >
            0 && (
            <div>
              Сети:{" "}
              {plan.operators
                .map(
                  (operator) =>
                    `${operator.name} ${operator.network}`
                )
                .join(", ")}
            </div>
          )}

          {daily &&
            plan.fupPolicy && (
              <div>
                После дневного
                лимита:{" "}
                {plan.fupPolicy}
              </div>
            )}

          {plan.topUpSupported && (
            <div>
              Доступно пополнение
            </div>
          )}
        </div>

        <div className="mt-5 flex h-12 items-center justify-center rounded-2xl bg-white font-semibold text-black">
          Выбрать тариф
        </div>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
        <button
          onClick={() =>
            router.back()
          }
          className="mb-8 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xl"
        >
          ←
        </button>

        <header className="mb-8">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
            WYLD ROAM
          </div>

          <div className="flex items-center gap-3">
            <div className="text-4xl">
              {flag}
            </div>

            <div>
              <h1 className="text-3xl font-semibold">
                {loadingLocations
                  ? "Загрузка..."
                  : locationName}
              </h1>

              <p className="mt-1 text-sm text-white/45">
                Выберите подходящий
                тариф
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="py-12 text-center text-sm text-white/40">
            Загружаем тарифы...
          </div>
        ) : (
          <>
            {regularPlans.length >
              0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Интернет-пакеты
                  </h2>

                  <div className="text-xs text-white/35">
                    {
                      regularPlans.length
                    }{" "}
                    тарифов
                  </div>
                </div>

                <div className="space-y-4">
                  {regularPlans.map(
                    (plan) =>
                      renderPlan(plan)
                  )}
                </div>
              </section>
            )}

            {dailyPlans.length >
              0 && (
              <section className="mt-10">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    Пакеты на день
                  </h2>

                  <div className="text-xs text-white/35">
                    {
                      dailyPlans.length
                    }{" "}
                    тарифов
                  </div>
                </div>

                <p className="mb-4 text-sm leading-6 text-white/40">
                  После использования
                  дневного объёма
                  скорость может быть
                  ограничена до
                  следующего дня.
                </p>

                <div className="space-y-4">
                  {dailyPlans.map(
                    (plan) =>
                      renderPlan(
                        plan,
                        true
                      )
                  )}
                </div>
              </section>
            )}

            {plans.length === 0 && (
              <div className="py-12 text-center text-sm text-white/40">
                Для этого направления
                тарифов пока нет
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
