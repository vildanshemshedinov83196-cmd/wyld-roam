import { NextResponse } from "next/server";
import { tbankRequest } from "@/lib/tbank";

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

export async function POST() {
  try {
    const orderId = `roam_live_${Date.now()}`;

    const init = await tbankRequest<InitResponse>(
      "Init",
      {
        Amount: 1000,
        OrderId: orderId,
        Description: "WYLD ROAM — СБП 10 RUB",
      }
    );

    if (!init.Success || !init.PaymentId) {
      return NextResponse.json(
        {
          ok: false,
          stage: "Init",
          response: init,
        },
        { status: 400 }
      );
    }

    const paymentId = String(init.PaymentId);

    const qr = await tbankRequest<QrResponse>(
      "GetQr",
      {
        PaymentId: paymentId,
        DataType: "PAYLOAD",
        PaymentMethod: "SBP",
      }
    );

    if (!qr.Success || !qr.Data) {
      return NextResponse.json(
        {
          ok: false,
          stage: "GetQr",
          orderId,
          paymentId,
          response: qr,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      live: true,
      amountRub: 10,
      orderId,
      paymentId,
      status: init.Status ?? null,
      qrData: qr.Data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}
