"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  BackButton,
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

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

function durationLabel(
  duration: number,
  unit: string
) {
  if (unit !== "DAY") {
    return `${duration} ${unit}`;
  }

  if (duration === 1) {
    return "1 день";
  }

  if (
    duration >= 2 &&
    duration <= 4
  ) {
    return `${duration} дня`;
  }

  return `${duration} дней`;
}

function findLocation(
  locations: Location[],
  code: string
): Location | null {
  for (
    const location
    of locations
  ) {
    if (
      location.code === code
    ) {
      return location;
    }

    if (
      location.subLocations
        ?.length
    ) {
      const nested =
        findLocation(
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
      const displayNames =
        new Intl.DisplayNames(
          ["ru"],
          {
            type: "region",
          }
        );

      const translated =
        displayNames.of(code);

      if (
        translated &&
        translated.toUpperCase() !==
          code
      ) {
        return translated;
      }
    }
  } catch {
    // fallback below
  }

  return fallbackName;
}

export default function PlansPage() {
  const params =
    useParams();

  const router =
    useRouter();

  const code =
    String(
      params.code ?? ""
    ).toUpperCase();

  const [
    plans,
    setPlans,
  ] = useState<Plan[]>([]);

  const [
    activeCategory,
    setActiveCategory,
  ] = useState<
    "standard" | "daily"
  >("standard");

  const [
    locations,
    setLocations,
  ] = useState<Location[]>([]);

  const [
    loadingPlans,
    setLoadingPlans,
  ] = useState(true);

  const [
    loadingLocations,
    setLoadingLocations,
  ] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      try {
        const response =
          await fetch(
            `/api/plans?country=${encodeURIComponent(
              code
            )}`
          );

        const data =
          await response.json();

        if (data.success) {
          setPlans(
            data.plans ?? []
          );
        }
      } finally {
        setLoadingPlans(
          false
        );
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
          await fetch(
            "/api/locations"
          );

        const data =
          await response.json();

        if (data.success) {
          setLocations(
            data.locations ??
              []
          );
        }
      } finally {
        setLoadingLocations(
          false
        );
      }
    }

    loadLocations();
  }, []);

  const regularPlans =
    useMemo(
      () =>
        plans
          .filter(
            (plan) =>
              plan.dataType !==
              2
          )
          .sort(
            (a, b) =>
              a.volumeBytes !==
              b.volumeBytes
                ? a.volumeBytes -
                  b.volumeBytes
                : a.duration -
                  b.duration
          ),
      [plans]
    );

  const dailyPlans =
    useMemo(
      () =>
        plans
          .filter(
            (plan) =>
              plan.dataType ===
              2
          )
          .sort(
            (a, b) =>
              a.volumeBytes -
              b.volumeBytes
          ),
      [plans]
    );

  const currentLocation =
    useMemo(
      () =>
        findLocation(
          locations,
          code
        ),
      [locations, code]
    );

  const locationName =
    useMemo(() => {
      if (!currentLocation) {
        return code;
      }

      return getRussianLocationName(
        code,
        currentLocation.name
      );
    }, [
      currentLocation,
      code,
    ]);

  const flag =
    getFlagEmoji(code);

  const loading =
    loadingPlans ||
    loadingLocations;

  function selectPlan(
    plan: Plan
  ) {
    const params =
      new URLSearchParams({
        package:
          plan.packageCode,
        country: code,
        planName:
          plan.name,
        data:
          plan.data,
        duration:
          String(
            plan.duration
          ),
        durationUnit:
          plan.durationUnit,
        amount:
          String(
            plan.retailPrice
          ),

      });

    router.push(
      `/checkout?${params.toString()}`
    );
  }

  function renderPlan(
    plan: Plan,
    daily = false
  ) {
    const isPopular =
      !daily &&
      Math.round(
        plan.volumeBytes /
          1024 /
          1024 /
          1024
      ) === 20;

    return (
      <button
        key={
          plan.packageCode
        }
        type="button"
        onClick={() =>
          selectPlan(plan)
        }
        className={`roam-card relative w-full p-5 text-left transition active:scale-[0.985] ${
          isPopular
            ? "border-violet-400/70 shadow-[0_0_32px_rgba(139,92,246,0.16)]"
            : ""
        }`}
      >
        {!daily && (
          <div className="mb-3 flex justify-end">
            <div
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                isPopular
                  ? "bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                  : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              }`}
            >
              {isPopular
                ? "★ ПОПУЛЯРНЫЙ"
                : "ВЫГОДНО"}
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="roam-chip">
              {daily
                ? "DAILY"
                : "DATA"}
            </div>

            <div className="mt-4 text-[28px] font-black tracking-[-0.045em]">
              {daily
                ? `${plan.data} / день`
                : plan.data}
            </div>

            {daily && (
              <div className="mt-1 text-sm text-white/42">
                {durationLabel(
                  plan.duration,
                  plan.durationUnit
                )}
              </div>
            )}
          </div>

          <div className="text-right">
            <div className="text-[26px] font-black tracking-[-0.04em]">
              $
              {plan.retailPrice.toFixed(
                2
              )}
            </div>

            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/28">
              total
            </div>
          </div>
        </div>

        <div className="roam-divider my-5" />

        <div className="space-y-2.5 text-[13px] leading-5 text-white/48">
          {plan.speed && (
            <div className="flex gap-2">
              <span className="text-cyan-200">
                ⚡
              </span>
              <span>
                {plan.speed}
              </span>
            </div>
          )}

          {daily &&
            plan.fupPolicy && (
              <div className="flex gap-2">
                <span className="text-cyan-200">
                  ∞
                </span>
                <span>
                  После лимита:{" "}
                  {plan.fupPolicy}
                </span>
              </div>
            )}

          {plan.topUpSupported && (
            <div className="flex gap-2">
              <span className="text-cyan-200">
                +
              </span>
              <span>
                Можно пополнять
              </span>
            </div>
          )}
        </div>

        <div className="roam-primary mt-5">
          Выбрать тариф
          <span>→</span>
        </div>
      </button>
    );
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container-no-nav">
        <div className="flex items-center justify-between">
          <BackButton />
          <Brand />
        </div>

        <header className="mt-9">
          <div className="flex items-center gap-4">
            <div className="grid h-[72px] w-[72px] place-items-center rounded-[24px] border border-white/10 bg-white/[0.055] text-4xl">
              {flag}
            </div>

            <div className="min-w-0">
              <div className="roam-kicker">
                eSIM plans
              </div>

              <h1 className="mt-1 truncate text-[34px] font-black tracking-[-0.045em]">
                {loadingLocations
                  ? "Загрузка..."
                  : locationName}
              </h1>
            </div>
          </div>

          <p className="roam-subtitle mt-5">
            Выберите объём
            интернета и срок
            действия тарифа.
          </p>
        </header>

        {loading ? (
          <div className="roam-pulse py-20 text-center text-sm text-white/35">
            Загружаем тарифы...
          </div>
        ) : (
          <>
            {(regularPlans.length >
              0 ||
              dailyPlans.length >
                0) && (
              <div className="mt-9">
                <div className="grid grid-cols-2 rounded-[22px] border border-white/10 bg-white/[0.045] p-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveCategory(
                        "standard"
                      )
                    }
                    className={`rounded-[17px] px-3 py-3.5 text-sm font-bold transition ${
                      activeCategory ===
                      "standard"
                        ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg"
                        : "text-white/40"
                    }`}
                  >
                    Стандартные
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveCategory(
                        "daily"
                      )
                    }
                    className={`rounded-[17px] px-3 py-3.5 text-sm font-bold transition ${
                      activeCategory ===
                      "daily"
                        ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg"
                        : "text-white/40"
                    }`}
                  >
                    Суточные
                  </button>
                </div>
              </div>
            )}

            {activeCategory ===
              "standard" &&
              regularPlans.length >
                0 && (
                <section className="mt-7">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <div className="roam-kicker">
                        Standard
                      </div>

                      <h2 className="mt-2 text-xl font-bold">
                        Стандартные тарифы
                      </h2>
                    </div>

                    <div className="text-xs text-white/30">
                      {
                        regularPlans.length
                      }{" "}
                      тарифов
                    </div>
                  </div>

                  <div className="space-y-4">
                    {regularPlans.map(
                      (plan) =>
                        renderPlan(
                          plan
                        )
                    )}
                  </div>
                </section>
              )}

            {activeCategory ===
              "daily" &&
              dailyPlans.length >
                0 && (
                <section className="mt-7">
                  <div className="mb-4">
                    <div className="roam-kicker">
                      Daily
                    </div>

                    <h2 className="mt-2 text-xl font-bold">
                      Суточные тарифы
                    </h2>

                    <p className="mt-2 text-xs leading-5 text-white/37">
                      Выберите объём
                      интернета на один
                      день.
                    </p>
                  </div>

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

            {activeCategory ===
              "daily" &&
              dailyPlans.length ===
                0 &&
              plans.length >
                0 && (
                <div className="roam-card-soft mt-7 p-7 text-center">
                  <div className="text-lg font-bold">
                    Суточных тарифов нет
                  </div>

                  <p className="mt-2 text-sm text-white/40">
                    Для этой страны
                    доступны только
                    стандартные пакеты.
                  </p>
                </div>
              )}

            {plans.length ===
              0 && (
              <div className="roam-card-soft mt-10 p-7 text-center">
                <div className="text-lg font-bold">
                  Тарифов пока нет
                </div>

                <p className="mt-2 text-sm text-white/40">
                  Попробуйте другое
                  направление.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
