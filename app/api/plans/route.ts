import { NextRequest } from "next/server";
import {
  calculateRetailPrice,
  bytesToReadable,
} from "@/lib/pricing";

type EsimPackage = {
  packageCode: string;
  slug: string;
  name: string;
  price: number;
  currencyCode: string;
  volume: number;
  dataType: number;
  duration: number;
  durationUnit: string;
  location: string;
  locationCode: string;
  speed: string;
  ipExport: string;
  supportTopUpType: number;
  fupPolicy: string;
  locationNetworkList?: Array<{
    locationName: string;
    locationLogo: string;
    locationCode: string;
    operatorList?: Array<{
      operatorName: string;
      networkType: string;
    }>;
  }>;
};

export async function GET(request: NextRequest) {
  const accessCode = process.env.ESIM_ACCESS_CODE;

  if (!accessCode) {
    return Response.json(
      {
        success: false,
        error: "ESIM_ACCESS_CODE is not configured",
      },
      { status: 500 }
    );
  }

  const country =
    request.nextUrl.searchParams
      .get("country")
      ?.toUpperCase() ?? "";

  try {
    const response = await fetch(
      "https://api.esimaccess.com/api/v1/open/package/list",
      {
        method: "POST",
        headers: {
          "RT-AccessCode": accessCode,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locationCode: country,
          type: "",
          packageCode: "",
          iccid: "",
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: `eSIMAccess HTTP ${response.status}`,
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!data.success) {
      return Response.json(
        {
          success: false,
          errorCode: data.errorCode,
          error: data.errorMsg,
        },
        { status: 502 }
      );
    }

    const packages: EsimPackage[] =
      data.obj?.packageList ?? [];

    /*
     * WYLD ROAM catalog:
     *
     * STANDARD
     * 3 / 5 / 10 / 20 / 50 GB
     * 30 days
     *
     * DAILY
     * 1 / 2 / 3 / 5 / 10 GB per day
     * 1 day
     */

    const standardVolumes =
      new Set([
        "3 GB",
        "5 GB",
        "10 GB",
        "20 GB",
        "50 GB",
      ]);

    const dailyVolumes =
      new Set([
        "1 GB",
        "2 GB",
        "3 GB",
        "5 GB",
        "10 GB",
      ]);

    /*
     * Фильтруем ДО расчёта цены.
     * Так лишние SKU eSIMAccess
     * вообще не попадают в pricing.
     */
    const eligiblePackages =
      packages.filter((item) => {
        const data =
          bytesToReadable(
            item.volume
          );

        const unit =
          item.durationUnit
            .toLowerCase();

        const isStandard =
          item.dataType === 1 &&
          item.duration === 30 &&
          unit.includes("day") &&
          standardVolumes.has(
            data
          );

        const isDaily =
          item.dataType === 2 &&
          item.duration === 1 &&
          unit.includes("day") &&
          dailyVolumes.has(
            data
          );

        return (
          isStandard ||
          isDaily
        );
      });

    const mappedPlans =
      eligiblePackages.map(
        (item) => {
          const wholesalePrice =
            item.price / 10000;

          const retailPrice =
            calculateRetailPrice(
              wholesalePrice,
              item.volume,
              item.dataType
            );

          const operators =
            item.locationNetworkList
              ?.flatMap(
                (location) =>
                  location.operatorList
                    ?.map(
                      (
                        operator
                      ) => ({
                        name:
                          operator.operatorName,
                        network:
                          operator.networkType,
                      })
                    ) ?? []
              ) ?? [];

          return {
            packageCode:
              item.packageCode,
            slug:
              item.slug,
            name:
              item.name,

            location:
              item.location,
            locationCode:
              item.locationCode,

            data:
              bytesToReadable(
                item.volume
              ),
            volumeBytes:
              item.volume,

            duration:
              item.duration,
            durationUnit:
              item.durationUnit,

            speed:
              item.speed,
            ipExport:
              item.ipExport,

            dataType:
              item.dataType,
            fupPolicy:
              item.fupPolicy,

            topUpSupported:
              item.supportTopUpType >
              0,

            retailPrice,
            currency:
              item.currencyCode,

            operators,

            _wholesalePrice:
              wholesalePrice,
          };
        }
      );

    const uniquePlans = new Map<
      string,
      (typeof mappedPlans)[number]
    >();

    for (const plan of mappedPlans) {
      const duplicateKey =
        `${plan.dataType}:${plan.data}`;

      const existing =
        uniquePlans.get(
          duplicateKey
        );

      if (!existing) {
        uniquePlans.set(
          duplicateKey,
          plan
        );
        continue;
      }

      // Если один пакет поддерживает Top Up,
      // а другой нет — выбираем пополняемый.
      if (
        plan.topUpSupported &&
        !existing.topUpSupported
      ) {
        uniquePlans.set(
          duplicateKey,
          plan
        );
        continue;
      }

      if (
        existing.topUpSupported &&
        !plan.topUpSupported
      ) {
        continue;
      }

      // При одинаковых возможностях
      // оставляем самый дешёвый supplier SKU.
      if (
        plan._wholesalePrice <
        existing._wholesalePrice
      ) {
        uniquePlans.set(
          duplicateKey,
          plan
        );
      }
    }

    const plans = Array.from(
      uniquePlans.values()
    )
      .sort(
        (a, b) => {
          if (
            a.dataType !==
            b.dataType
          ) {
            return (
              a.dataType -
              b.dataType
            );
          }

          return (
            a.volumeBytes -
            b.volumeBytes
          );
        }
      )
      .map(
        ({
          _wholesalePrice,
          ...plan
        }) => plan
      );

    return Response.json({
      success: true,
      country: country || null,
      count: plans.length,
      plans,
    });
  } catch (error) {
    console.error(
      "WYLD ROAM plans error:",
      error
    );

    return Response.json(
      {
        success: false,
        error: "Failed to load eSIM plans",
      },
      { status: 500 }
    );
  }
}
