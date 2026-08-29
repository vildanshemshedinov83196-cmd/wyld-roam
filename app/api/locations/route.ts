type LocationItem = {
  code: string;
  name: string;
  type: number;
  continent?: string;
  subLocationList?: LocationItem[] | null;
};

export async function GET() {
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

  const response = await fetch(
    "https://api.esimaccess.com/api/v1/open/location/list",
    {
      method: "POST",
      headers: {
        "RT-AccessCode": accessCode,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
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

  const rawLocations: LocationItem[] =
    data.obj?.locationList ?? [];

  const locations = rawLocations.map((location) => ({
    code: location.code,
    name: location.name,
    type: location.type,
    continent: location.continent ?? null,

    subLocations:
      location.subLocationList?.map((sub) => ({
        code: sub.code,
        name: sub.name,
        type: sub.type,
        continent: sub.continent ?? null,
      })) ?? [],
  }));

  return Response.json({
    success: true,
    count: locations.length,
    locations,
  });
}
