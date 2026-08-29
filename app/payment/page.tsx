"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

type Order = {
  id: string;
  packageCode: string;
  country: string;
  planName: string;
  data: string;
  duration: number;
  durationUnit: string;
  amount: number;
  currency: string;
  status: string;
};

function statusLabel(status: string) {
  switch (status) {
    case "pending_payment":
      return "Ожидает оплаты";
    case "paid":
      return "Оплачено";
    case "ordering_esim":
      return "Выпускаем eSIM";
    case "esim_ready":
      return "eSIM готова";
    case "failed":
      return "Ошибка";
    case "refunded":
      return "Возврат";
    case "cancelled":
      return "Отменён";
    default:
      return status;
  }
}

function PaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId =
    searchParams.get("order") ?? "";

  const [order, setOrder] =
    useState<Order | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) {
        setError("Номер заказа отсутствует");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(
            orderId
          )}`,
          {
            cache: "no-store",
          }
        );

        const data =
          await response.json();

        if (!data.success) {
          setError(
            data.error ||
              "Заказ не найден"
          );
          return;
        }

        setOrder(data.order);
      } catch {
        setError(
          "Не удалось загрузить заказ"
        );
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-white/40">
        Загружаем заказ...
      </div>
    );
  }

  if (!order || error) {
    return (
      <div className="py-12">
        <button
          onClick={() => router.push("/")}
          className="mb-8 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xl"
        >
          ←
        </button>

        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <h1 className="text-xl font-semibold">
            Заказ не найден
          </h1>

          <p className="mt-3 text-sm text-white/45">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => router.back()}
        className="mb-8 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xl"
      >
        ←
      </button>

      <header className="mb-8">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-white/40">
          WYLD ROAM
        </div>

        <h1 className="text-3xl font-semibold">
          Оплата
        </h1>

        <p className="mt-2 text-sm text-white/45">
          Заказ создан и сохранён
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/35">
              Статус
            </div>

            <div className="mt-1 font-medium">
              {statusLabel(order.status)}
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/60">
            {order.country}
          </div>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold">
              {order.data}
            </div>

            <div className="mt-1 text-sm text-white/45">
              {order.duration} дней
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-semibold">
              ${order.amount.toFixed(2)}
            </div>

            <div className="mt-1 text-xs text-white/35">
              {order.currency}
            </div>
          </div>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <div className="text-xs text-white/30">
          Заказ
        </div>

        <div className="mt-1 break-all text-xs text-white/50">
          {order.id}
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="text-sm font-semibold">
          Способ оплаты
        </div>

        <p className="mt-2 text-sm leading-6 text-white/40">
          Здесь появятся доступные способы оплаты WYLD ROAM.
        </p>
      </section>

      <button
        disabled
        className="mt-6 flex h-14 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-white/20 text-base font-semibold text-white/40"
      >
        Оплатить · ${order.amount.toFixed(2)}
      </button>

      <p className="mt-4 text-center text-xs leading-5 text-white/30">
        Выпуск eSIM начнётся только после подтверждения оплаты.
      </p>
    </>
  );
}

export default function PaymentPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
        <Suspense
          fallback={
            <div className="py-20 text-center text-sm text-white/40">
              Загружаем...
            </div>
          }
        >
          <PaymentContent />
        </Suspense>
      </div>
    </main>
  );
}
