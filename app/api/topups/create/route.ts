import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  calculateRetailPrice,
} from "@/lib/pricing";

export const runtime =
  "nodejs";

type SupplierPlan = {
  packageCode?: string;
  slug?: string;
  name?: string;
  price?: number;
  volume?: number;
  dataType?: number;
  duration?: number;
  durationUnit?: string;
  locationCode?: string;
};

function dataLabel(
  bytes?: number
) {
  if (!bytes) return "—";

  const gb =
    bytes /
    1024 /
    1024 /
    1024;

  if (gb >= 1) {
    return `${Number.isInteger(gb)
      ? gb.toFixed(0)
      : gb.toFixed(1)} GB`;
  }

  return `${Math.round(
    bytes /
      1024 /
      1024
  )} MB`;
}

export async function POST(
  request: NextRequest
) {
  try {
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      );

    if (!initData) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Telegram authorization required",
        },
        { status: 401 }
      );
    }

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    if (!telegramUser) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid Telegram authorization",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const esimId =
      String(
        body?.esimId ?? ""
      ).trim();

    const slug =
      String(
        body?.slug ?? ""
      ).trim();

    if (
      !esimId ||
      !slug
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "esimId and slug are required",
        },
        { status: 400 }
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: user,
      error: userError,
    } = await supabase
      .from("roam_users")
      .select("id, role")
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "WYLD ROAM user not found",
        },
        { status: 404 }
      );
    }

    const {
      data: esim,
      error: esimError,
    } = await supabase
      .from("roam_esims")
      .select(
        "id,user_id,iccid,country_code,status"
      )
      .eq("id", esimId)
      .maybeSingle();

    if (
      esimError ||
      !esim
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "eSIM not found",
        },
        { status: 404 }
      );
    }

    if (
      user.role !== "owner" &&
      esim.user_id !== user.id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Access denied",
        },
        { status: 403 }
      );
    }

    if (!esim.iccid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ICCID unavailable",
        },
        { status: 400 }
      );
    }

    const accessCode =
      process.env
        .ESIM_ACCESS_CODE;

    if (!accessCode) {
      throw new Error(
        "ESIM_ACCESS_CODE is not configured"
      );
    }

    /*
     * Критично:
     * цену и совместимость повторно
     * получаем с сервера поставщика.
     * Клиентская цена из браузера
     * никогда не считается доверенной.
     */
    const supplierResponse =
      await fetch(
        "https://api.esimaccess.com/api/v1/open/package/list",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "RT-AccessCode":
              accessCode,
          },

          body:
            JSON.stringify({
              locationCode:
                "",

              type:
                "TOPUP",

              packageCode:
                "",

              iccid:
                esim.iccid,
            }),

          cache:
            "no-store",
        }
      );

    const supplierData =
      await supplierResponse.json();

    if (
      !supplierResponse.ok ||
      supplierData?.success !== true
    ) {
      throw new Error(
        supplierData?.errorMsg ||
          "Could not verify Top Up package"
      );
    }

    const plans:
      SupplierPlan[] =
        supplierData?.obj
          ?.packageList ?? [];

    const plan =
      plans.find(
        (item) =>
          item.slug === slug
      );

    if (
      !plan ||
      !plan.slug ||
      !plan.packageCode ||
      typeof plan.price !==
        "number" ||
      plan.price <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Этот Top Up больше недоступен",
        },
        { status: 409 }
      );
    }

    const supplierCost =
      plan.price /
      10000;

    const amount =
      calculateRetailPrice(
        supplierCost,
        Number(plan.volume),
        Number(
          plan.dataType ?? 1
        )
      );

    const {
      data: topup,
      error: insertError,
    } = await supabase
      .from("roam_topups")
      .insert({
        user_id:
          user.id,

        esim_id:
          esim.id,

        iccid:
          esim.iccid,

        slug:
          plan.slug,

        package_code:
          plan.packageCode,

        plan_name:
          plan.name ??
          "eSIM Top Up",

        data_label:
          dataLabel(
            plan.volume
          ),

        duration:
          plan.duration ??
          null,

        duration_unit:
          plan.durationUnit ??
          null,

        supplier_cost:
          supplierCost,

        amount,

        currency:
          "USD",

        status:
          "pending_payment",
      })
      .select(
        `
        id,
        plan_name,
        data_label,
        duration,
        duration_unit,
        amount,
        currency,
        status
        `
      )
      .single();

    if (
      insertError ||
      !topup
    ) {
      console.error(
        "Top Up insert error:",
        insertError
      );

      throw new Error(
        "Could not create Top Up"
      );
    }

    return NextResponse.json({
      success: true,
      topup,
    });
  } catch (error) {
    console.error(
      "Create Top Up error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
