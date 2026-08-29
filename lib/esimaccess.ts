const ESIM_ACCESS_API =
  "https://api.esimaccess.com/api/v1/open";

type BaseResponse = {
  success: boolean;
  errorCode?: string | null;
  errorMsg?: string | null;
};

type BalanceResponse =
  BaseResponse & {
    obj?: {
      balance?: number;
    };
  };

type OrderResponse =
  BaseResponse & {
    obj?: {
      orderNo?: string;
      transactionId?: string;
    };
  };

export type EsimProfile = {
  orderNo?: string;
  esimTranNo?: string;
  iccid?: string;
  imsi?: string;

  /*
   * Полная строка активации:
   * LPA:1$SM-DP+$MATCHING_CODE
   */
  ac?: string;

  qrCodeUrl?: string;

  smdpStatus?: string;
  esimStatus?: string;

  expiredTime?: string;

  totalVolume?: number;
  orderUsage?: number;

  apn?: string;

  packageList?: Array<{
    packageCode?: string;
    packageName?: string;
    duration?: number;
    volume?: number;
    locationCode?: string;
  }>;
};

type EsimListResponse =
  BaseResponse & {
    obj?: {
      esimList?: EsimProfile[];
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

function fromSupplierMoney(
  value: number
) {
  return (
    Number(value || 0) /
    10000
  );
}

function toSupplierMoney(
  value: number
) {
  return Math.round(
    Number(value || 0) *
      10000
  );
}

/*
 * ======================================================
 * BALANCE
 * ======================================================
 */

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
      BalanceResponse;

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
        "Failed to get eSIMAccess balance"
    );
  }

  return fromSupplierMoney(
    Number(
      result.obj?.balance ??
        0
    )
  );
}

/*
 * ======================================================
 * ORDER
 * ======================================================
 */

export async function orderEsim(params: {
  transactionId: string;
  packageCode: string;
  supplierCost: number;
}) {
  const rawPrice =
    toSupplierMoney(
      params.supplierCost
    );

  if (
    !Number.isFinite(
      rawPrice
    ) ||
    rawPrice <= 0
  ) {
    throw new Error(
      "Invalid supplier price"
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

            /*
             * Передаём цену.
             * Если цена поставщика
             * изменилась, заказ должен
             * завершиться ошибкой вместо
             * неожиданного списания.
             */
            amount:
              rawPrice,

            packageInfoList: [
              {
                packageCode:
                  params.packageCode,

                count: 1,

                price:
                  rawPrice,
              },
            ],
          }),

        cache:
          "no-store",
      }
    );

  const result =
    (await response.json()) as
      OrderResponse;

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
        "eSIMAccess order failed"
    );
  }

  const orderNo =
    result.obj?.orderNo;

  if (!orderNo) {
    throw new Error(
      "eSIMAccess did not return orderNo"
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

/*
 * ======================================================
 * QUERY ALLOCATED PROFILE
 * ======================================================
 *
 * После покупки профиль может
 * появиться не мгновенно.
 *
 * Ищем именно по orderNo.
 */

export async function queryEsimByOrderNo(
  orderNo: string
) {
  const response =
    await fetch(
      `${ESIM_ACCESS_API}/esim/list`,
      {
        method: "POST",

        headers:
          getHeaders(),

        body:
          JSON.stringify({
            orderNo,

            pager: {
              pageNum: 1,
              pageSize: 20,
            },
          }),

        cache:
          "no-store",
      }
    );

  const result =
    (await response.json()) as
      EsimListResponse;

  if (
    !response.ok ||
    !result.success
  ) {
    console.error(
      "eSIMAccess profile query error:",
      result
    );

    throw new Error(
      result.errorMsg ||
        "Failed to query eSIM profile"
    );
  }

  const profiles =
    result.obj?.esimList ??
    [];

  if (
    profiles.length === 0
  ) {
    return null;
  }

  /*
   * Дополнительно убеждаемся,
   * что профиль относится
   * к нужному orderNo.
   */
  return (
    profiles.find(
      (profile) =>
        profile.orderNo ===
        orderNo
    ) ??
    profiles[0]
  );
}

/*
 * ======================================================
 * WAIT FOR PROFILE
 * ======================================================
 *
 * Используем polling вместо
 * слепого sleep на 30 секунд.
 */

export async function waitForEsimProfile(
  orderNo: string,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
) {
  const attempts =
    options?.attempts ??
    6;

  const delayMs =
    options?.delayMs ??
    5000;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    const profile =
      await queryEsimByOrderNo(
        orderNo
      );

    if (
      profile?.iccid &&
      (
        profile.ac ||
        profile.qrCodeUrl
      )
    ) {
      return profile;
    }

    if (
      attempt <
      attempts
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            delayMs
          )
      );
    }
  }

  /*
   * Это НЕ означает, что покупка
   * провалилась.
   *
   * Профиль мог просто ещё
   * не успеть выделиться.
   */
  return null;
}

/*
 * ======================================================
 * PARSE ACTIVATION CODE
 * ======================================================
 *
 * Пример:
 *
 * LPA:1$rsp.example.com$ABC123
 *
 * smdpAddress = rsp.example.com
 * activationCode = ABC123
 */

export function parseActivationCode(
  ac?: string | null
) {
  if (!ac) {
    return {
      smdpAddress: null,
      activationCode: null,
    };
  }

  const parts =
    ac.split("$");

  if (
    parts.length < 3
  ) {
    return {
      smdpAddress: null,
      activationCode:
        ac,
    };
  }

  return {
    smdpAddress:
      parts[1] || null,

    activationCode:
      parts
        .slice(2)
        .join("$") ||
      null,
  };
}
