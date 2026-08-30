import {
  NextResponse,
} from "next/server";

import {
  tbankRequest,
} from "@/lib/tbank";

type InitResponse = {
  Success?: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  PaymentId?: string;
  Status?: string;
};

type QrResponse = {
  Success?: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  Data?: string;
};

type StateResponse = {
  Success?: boolean;
  ErrorCode?: string;
  Message?: string;
  Details?: string;
  PaymentId?: string;
  Status?: string;
};

export async function POST() {
  try {
    /*
     * Это отдельный безопасный
     * тест T-Bank.
     *
     * Он НЕ создаёт roam_order,
     * НЕ меняет roam_payments
     * и НЕ вызывает eSIMAccess.
     */

    const orderId =
      `roam_test_${Date.now()}`;

    /*
     * Минимальная сумма СБП —
     * 10 рублей = 1000 копеек.
     */
    const init =
      await tbankRequest<
        InitResponse
      >(
        "Init",
        {
          Amount: 1000,
          OrderId:
            orderId,
          Description:
            "WYLD ROAM — тест СБП",
          NotificationURL:
            "https://wyld-roam.vercel.app/api/payments/tbank/webhook",
        }
      );

    if (
      !init.Success ||
      !init.PaymentId
    ) {
      return NextResponse.json(
        {
          ok: false,
          stage: "Init",
          response:
            init,
        },
        {
          status: 400,
        }
      );
    }

    const paymentId =
      String(
        init.PaymentId
      );

    const qr =
      await tbankRequest<
        QrResponse
      >(
        "GetQr",
        {
          PaymentId:
            paymentId,
          DataType:
            "PAYLOAD",
          PaymentMethod:
            "SBP",
        }
      );

    if (!qr.Success) {
      return NextResponse.json(
        {
          ok: false,
          stage: "GetQr",
          paymentId,
          response:
            qr,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Эмулируем успешную
     * СБП-оплату на DEMO
     * терминале.
     */
    const testPayment =
      await tbankRequest<
        Record<
          string,
          unknown
        >
      >(
        "SbpPayTest",
        {
          PaymentId:
            paymentId,
        }
      );

    /*
     * Даём тестовой сессии
     * короткое время обновить
     * состояние платежа.
     */
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1200
        )
    );

    const state =
      await tbankRequest<
        StateResponse
      >(
        "GetState",
        {
          PaymentId:
            paymentId,
        }
      );

    return NextResponse.json(
      {
        ok:
          state.Status ===
          "CONFIRMED",

        orderId,
        paymentId,

        initStatus:
          init.Status ??
          null,

        qrCreated:
          Boolean(qr.Data),

        testPayment,

        finalStatus:
          state.Status ??
          null,

        /*
         * Сам QR payload специально
         * здесь не возвращаем —
         * для автоматического теста
         * он нам сейчас не нужен.
         */
      }
    );
  } catch (error) {
    console.error(
      "T-Bank SBP test error:",
      error
    );

    const cause =
      error instanceof Error
        ? (error as Error & {
            cause?: {
              code?: string;
              message?: string;
            };
          }).cause
        : undefined;

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",

        causeCode:
          cause?.code ??
          null,

        causeMessage:
          cause?.message ??
          null,
      },
      {
        status: 500,
      }
    );
  }
}
