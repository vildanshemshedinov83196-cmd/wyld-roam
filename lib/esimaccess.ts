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

export async function getEsimAccessBalance() {
  const response =
    await fetch(
      "https://api.esimaccess.com/api/v1/open/balance/query",
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
    throw new Error(
      result.errorMsg ||
        "Не удалось получить баланс eSIMAccess"
    );
  }

  return Number(
    result.obj?.balance ?? 0
  );
}

export async function orderEsim(params: {
  transactionId: string;
  packageCode: string;
  supplierPriceRaw: number;
}) {
  const response =
    await fetch(
      "https://api.esimaccess.com/api/v1/open/esim/order",
      {
        method: "POST",

        headers:
          getHeaders(),

        body:
          JSON.stringify({
            transactionId:
              params.transactionId,

            amount:
              params.supplierPriceRaw,

            packageInfoList: [
              {
                packageCode:
                  params.packageCode,

                count: 1,

                price:
                  params.supplierPriceRaw,
              },
            ],
          }),
      }
    );

  const result =
    (await response.json()) as
      EsimAccessOrderResponse;

  if (
    !response.ok ||
    !result.success
  ) {
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
