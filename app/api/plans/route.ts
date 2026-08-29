import { NextRequest } from "next/server";

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

function bytesToReadable(bytes: number) {
  const gb = bytes / 1024 / 1024 / 1024;

  if (gb >= 1) {
    return `${Number(gb.toFixed(2))} GB`;
  }

  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)} MB`;
}

function calculateRetailPrice(cost: number) {
  let price: number;

  if (cost <= 0.4) {
    return 0.99;
  }

  if (cost <= 1) {
    return 1.99;
  }

  if (cost <= 2) {
    price = cost * 2.5;
  } else if (cost <= 5) {
    price = cost * 2.1;
  } else if (cost <= 10) {
    price = cost * 1.8;
  } else if (cost <= 20) {
    price = cost * 1.7;
  } else {
    price = cost * 1.45;
  }

  return Math.floor(price) + 0.99;
}

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

    const plans = packages.map((item) => {
      const wholesalePrice = item.price / 10000;

      const retailPrice =
        calculateRetailPrice(wholesalePrice);

      const operators =
        item.locationNetworkList?.flatMap(
          (location) =>
            location.operatorList?.map(
              (operator) => ({
                name: operator.operatorName,
                network: operator.networkType,
              })
            ) ?? []
        ) ?? [];

      return {
        packageCode: item.packageCode,
        slug: item.slug,
        name: item.name,

        location: item.location,
        locationCode: item.locationCode,

        data: bytesToReadable(item.volume),
        volumeBytes: item.volume,

        duration: item.duration,
        durationUnit: item.durationUnit,

        speed: item.speed,
        ipExport: item.ipExport,

        dataType: item.dataType,
        fupPolicy: item.fupPolicy,

        topUpSupported:
          item.supportTopUpType > 0,

        retailPrice,
        currency: item.currencyCode,

        operators,
      };
    });

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
