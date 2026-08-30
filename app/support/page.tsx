"use client";

import {
  BackButton,
  BottomNav,
  Brand,
  RoamBackground,
} from "@/components/roam-ui";

const SUPPORT_BOT =
  "https://t.me/wyld_roam_support_bot";

export default function SupportPage() {
  function openSupport() {
    window.open(
      SUPPORT_BOT,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <main className="roam-page">
      <RoamBackground />

      <div className="roam-container">
        <div className="flex items-center gap-4">
          <BackButton href="/" />
          <Brand />
        </div>

        <section className="mt-9">
          <div className="roam-kicker">
            Support
          </div>

          <h1 className="roam-title mt-4">
            Помощь
            <br />
            и поддержка
          </h1>

          <p className="roam-subtitle mt-5 max-w-[360px]">
            Если возник вопрос по
            оплате, установке или
            работе eSIM — напишите
            нашей поддержке.
          </p>
        </section>

        <section className="roam-card mt-7 p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[17px] border border-cyan-200/10 bg-cyan-300/[0.07] text-xl">
              ◇
            </div>

            <div>
              <div className="text-lg font-bold">
                WYLD ROAM Support
              </div>

              <div className="mt-1 text-sm leading-6 text-white/40">
                Вопросы по eSIM,
                платежам и заказам.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openSupport}
            className="roam-primary mt-6"
          >
            Написать в поддержку
            <span>→</span>
          </button>

          <div className="mt-4 text-center text-xs text-white/30">
            @wyld_roam_support_bot
          </div>
        </section>

        <section className="roam-card mt-5 p-6">
          <div className="roam-kicker">
            Terms
          </div>

          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">
            Условия использования
          </h2>

          <div className="mt-5 space-y-4 text-sm leading-6 text-white/45">
            <p>
              WYLD ROAM предоставляет
              цифровые eSIM-пакеты для
              мобильного интернета в
              поддерживаемых странах и
              сетях.
            </p>

            <p>
              Перед покупкой пользователь
              самостоятельно проверяет,
              поддерживает ли его устройство
              технологию eSIM и не имеет ли
              оно операторской блокировки.
            </p>

            <p>
              Доступность сети, скорость и
              качество связи зависят от
              локальных операторов,
              покрытия, устройства и
              местоположения пользователя.
            </p>

            <p>
              После успешной оплаты заказ
              обрабатывается автоматически.
              Данные для установки eSIM
              появляются в разделе
              «Мои eSIM».
            </p>

            <p>
              Использование сервиса означает
              согласие пользователя с этими
              условиями.
            </p>
          </div>
        </section>

        <section className="roam-card mt-5 p-6">
          <div className="roam-kicker">
            Refund policy
          </div>

          <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">
            Политика возврата
          </h2>

          <div className="mt-5 space-y-4 text-sm leading-6 text-white/45">
            <p>
              Если оплата прошла, но eSIM
              не была выпущена из-за
              технической ошибки сервиса,
              обратитесь в поддержку.
            </p>

            <p>
              Каждый случай рассматривается
              индивидуально с учётом статуса
              заказа у поставщика eSIM.
            </p>

            <p>
              После успешного выпуска,
              активации или использования
              eSIM возможность возврата
              может быть ограничена,
              поскольку цифровая услуга уже
              была предоставлена.
            </p>

            <p>
              Если проблема возникла до
              использования eSIM, напишите
              нам и укажите информацию о
              заказе. Поддержка проверит
              возможность замены или
              возврата.
            </p>
          </div>
        </section>

        <section className="roam-card-soft mt-5 p-5">
          <div className="text-sm font-bold">
            Нужна помощь?
          </div>

          <p className="mt-2 text-xs leading-5 text-white/38">
            Свяжитесь с нами через
            Telegram:
            {" "}
            @wyld_roam_support_bot
          </p>

          <button
            type="button"
            onClick={openSupport}
            className="mt-4 text-sm font-bold text-cyan-100"
          >
            Открыть поддержку →
          </button>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
