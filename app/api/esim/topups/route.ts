import { NextRequest } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calculateRetailPrice } from "@/lib/pricing";

export const runtime = "nodejs";

type SupplierTopup = {
  packageCode?: string;
  slug?: string;
  name?: string;
  price?: number;
  currencyCode?: string;
  volume?: number;
  duration?: number;
  durationUnit?: string;
  locationCode?: string;
  supportTopUpType?: number;
  speed?: string;
  ipExport?: string;
  locationNetworkList?: Array<{
    locationName?: string;
    locationCode?: string;
    operatorList?: Array<{
      operatorName?: string;
      networkType?: string;
    }>;
  }>;
};

function getDataLabel(bytes?: number) {
  if (!bytes || bytes <= 0) return "—";

  const gb = bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    const rounded =
      Number.isInteger(gb)
        ? gb.toFixed(0)
        : gb.toFixed(1);

    return `${rounded} GB`;
  }

  const mb = Math.round(bytes / 1024 / 1024);
  return `${mb} MB`;
}

function getDurationLabel(
  duration?: number,
  unit?: string
) {
  if (!duration) return "—";

  const normalized = unit?.toUpperCase();

  if (normalized === "DAY") {
    return `${duration} дн.`;
  }

  return `${duration} ${unit ?? ""}`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const initData =
      typeof body?.initData === "string"
        ? body.initData
        : "";

    const esimId =
      typeof body?.esimId === "string"
        ? body.esimId
        : "";

    if (!initData) {
      return Response.json(
        { ok: false, error: "Telegram authorization required" },
        { status: 401 }
      );
    }

    if (!esimId) {
      return Response.json(
        { ok: false, error: "eSIM ID required" },
        { status: 400 }
      );
    }

    const telegramUser =
      verifyTelegramInitData(initData);

    if (!telegramUser) {
      return Response.json(
        { ok: false, error: "Invalid Telegram authorization" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: roamUser, error: userError } =
      await supabase
        .from("roam_users")
        .select("id, role")
        .eq(
          "telegram_user_id",
          telegramUser.id
        )
        .maybeSingle();

    if (userError || !roamUser) {
      return Response.json(
        { ok: false, error: "WYLD ROAM user not found" },
        { status: 404 }
      );
    }

    const { data: esim, error: esimError } =
      await supabase
        .from("roam_esims")
        .select(
          "id,user_id,iccid,country_code,package_code,status"
        )
        .eq("id", esimId)
        .maybeSingle();

    if (esimError || !esim) {
      return Response.json(
        { ok: false, error: "eSIM not found" },
        { status: 404 }
      );
    }

    if (
      roamUser.role !== "owner" &&
      esim.user_id !== roamUser.id
    ) {
      return Response.json(
        { ok: false, error: "Access denied" },
        { status: 403 }
      );
    }

    if (!esim.iccid) {
      return Response.json(
        { ok: false, error: "eSIM ICCID unavailable" },
        { status: 400 }
      );
    }

    const accessCode =
      process.env.ESIM_ACCESS_CODE;

    if (!accessCode) {
      throw new Error(
        "ESIM_ACCESS_CODE is not configured"
      );
    }

    const supplierResponse = await fetch(
      "https://api.esimaccess.com/api/v1/open/package/list",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "RT-AccessCode": accessCode,
        },
        body: JSON.stringify({
          locationCode: "",
          type: "TOPUP",
          packageCode: "",
          iccid: esim.iccid,
        }),
        cache: "no-store",
      }
    );

    const supplierData =
      await supplierResponse.json();

    if (
      !supplierResponse.ok ||
      supplierData?.success !== true
    ) {
      console.error(
        "eSIMAccess top-up package error:",
        supplierData
      );

      return Response.json(
        {
          ok: false,
          error:
            supplierData?.errorMsg ||
            "Could not load top-up packages",
        },
        { status: 502 }
      );
    }

    const supplierPackages: SupplierTopup[] =
      supplierData?.obj?.packageList ?? [];

    const packages = supplierPackages
      .filter(
        (plan) =>
          plan.supportTopUpType === 1 &&
          typeof plan.price === "number" &&
          plan.price > 0 &&
          Boolean(plan.slug)
      )
      .map((plan) => {
        const supplierCost =
          (plan.price ?? 0) / 10000;

        const retailPrice =
          calculateRetailPrice(supplierCost);

        const networks =
          plan.locationNetworkList
            ?.flatMap(
              (location) =>
                location.operatorList ?? []
            )
            .map((operator) =>
              [
                operator.operatorName,
                operator.networkType,
              ]
                .filter(Boolean)
                .join(" ")
            )
            .filter(Boolean) ?? [];

        return {
          packageCode: plan.packageCode,
          slug: plan.slug,
          name: plan.name,
          dataLabel: getDataLabel(
            plan.volume
          ),
          durationLabel:
            getDurationLabel(
              plan.duration,
              plan.durationUnit
            ),
          duration: plan.duration,
          durationUnit: plan.durationUnit,
          amount: retailPrice,
          currency: "USD",
          networks,
          speed: plan.speed ?? null,
          countryCode:
            plan.locationCode ??
            esim.country_code,
        };
      })
      .sort((a, b) => a.amount - b.amount);

    return Response.json({
      ok: true,
      esim: {
        id: esim.id,
        countryCode: esim.country_code,
        status: esim.status,
      },
      packages,
    });
  } catch (error) {
    console.error(
      "Top-up packages route error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
