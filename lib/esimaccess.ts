type EsimAccessBalanceResponse = {
  success: boolean;
  errorCode?: string | null;
  errorMsg?: string | null;
  obj?: {
    balance?: number;
  };
};

type EsimAccessOrderResponse = {
  success: boolean;
  errorCode?: string | null;
  errorMsg?: string | null;
  obj?: {
    orderNo?: string;
    transactionId?: string;
  };
};

const ESIM_ACCESS_API =
  "https://api.esimaccess.com/api/v1/open";

function getHeaders() {
  const accessCode =
    process.env.ESIM_ACCESS_CODE;

  if (!accessCode) {
    throw new Error(
      "ESIM_ACCESS_CODE is not configured"
    );
  }

  return {
    "Content-Type":
      "application/json",

    "RT-AccessCode":
      accessCode,
  };
}

/*
 * eSIMAccess хранит денежные значения
 * в единицах 1 / 10000 USD.
 *
 * Например:
 *
 * 500000 = $50.00
 * 110000 = $11.00
 * 1310000 = $131.00
 * 5000000 = $500.00
 */
function moneyFromEsimAccess(
  value: number
) {
  return (
    Number(value || 0) /
    10000
  );
}

/*
 * Обратное преобразование:
 *
 * $0.30 -> 3000
 * $1.19 -> 11900
 * $50.00 -> 500000
 */
function moneyToEsimAccess(
  value: number
) {
  return Math.round(
    Number(value || 0) *
      10000
  );
}

export async function getEsimAccessBalance() {
  const response =
    await fetch(
      `${ESIM_ACCESS_API}/balance/query`,
      {
        method: "POST",

        headers:
          getHeaders(),

        body:
          JSON.stringify({}),

        cache:
          "no-store",
      }
    );

  const result =
    (await response.json()) as
      EsimAccessBalanceResponse;

  if (
    !response.ok ||
    !result.success
  ) {
    console.error(
      "eSIMAccess balance error:",
      result
    );

    throw new Error(
      result.errorMsg ||
        "Не удалось получить баланс eSIMAccess"
    );
  }

  const rawBalance =
    Number(
      result.obj?.balance ??
        0
    );

  return moneyFromEsimAccess(
    rawBalance
  );
}

export async function orderEsim(params: {
  transactionId: string;
  packageCode: string;
  supplierPriceRaw?: number;
  supplierCost?: number;
}) {
  let supplierPriceRaw =
    params.supplierPriceRaw;

  if (
    supplierPriceRaw ===
      undefined &&
    params.supplierCost !==
      undefined
  ) {
    supplierPriceRaw =
      moneyToEsimAccess(
        params.supplierCost
      );
  }

  if (
    supplierPriceRaw ===
      undefined ||
    !Number.isFinite(
      supplierPriceRaw
    ) ||
    supplierPriceRaw <= 0
  ) {
    throw new Error(
      "Некорректная стоимость eSIM"
    );
  }

  const response =
    await fetch(
      `${ESIM_ACCESS_API}/esim/order`,
      {
        method: "POST",

        headers:
          getHeaders(),

        body:
          JSON.stringify({
            transactionId:
              params.transactionId,

            amount:
              supplierPriceRaw,

            packageInfoList: [
              {
                packageCode:
                  params.packageCode,

                count: 1,

                price:
                  supplierPriceRaw,
              },
            ],
          }),

        cache:
          "no-store",
      }
    );

  const result =
    (await response.json()) as
      EsimAccessOrderResponse;

  if (
    !response.ok ||
    !result.success
  ) {
    console.error(
      "eSIMAccess order error:",
      result
    );

    throw new Error(
      result.errorMsg ||
        "eSIMAccess не смог создать заказ"
    );
  }

  const orderNo =
    result.obj?.orderNo;

  if (!orderNo) {
    throw new Error(
      "eSIMAccess не вернул orderNo"
    );
  }

  return {
    orderNo,

    transactionId:
      result.obj
        ?.transactionId ??
      params.transactionId,
  };
}
