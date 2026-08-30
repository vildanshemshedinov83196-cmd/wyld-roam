import crypto from "crypto";

const HELEKET_API =
  "https://api.heleket.com";

function getConfig() {
  const merchantId =
    process.env.HELEKET_MERCHANT_ID;

  const apiKey =
    process.env.HELEKET_PAYMENT_API_KEY;

  if (!merchantId || !apiKey) {
    throw new Error(
      "Heleket is not configured"
    );
  }

  return {
    merchantId,
    apiKey,
  };
}

export function createHeleketSign(
  rawBody: string,
  apiKey: string
) {
  const encoded =
    Buffer.from(rawBody).toString(
      "base64"
    );

  return crypto
    .createHash("md5")
    .update(encoded + apiKey)
    .digest("hex");
}

export function verifyHeleketWebhook(
  payload: Record<string, unknown>
) {
  const receivedSign =
    typeof payload.sign === "string"
      ? payload.sign
      : "";

  if (!receivedSign) {
    return false;
  }

  const { apiKey } =
    getConfig();

  const {
    sign: _sign,
    ...unsignedPayload
  } = payload;

  /*
   * Heleket формирует webhook-signature
   * без поля sign.
   *
   * В их документации отдельно отмечено,
   * что slash должен сериализоваться как \/.
   */
  const unsignedJson =
    JSON.stringify(
      unsignedPayload
    ).replace(
      /\//g,
      "\\/"
    );

  const expected =
    createHeleketSign(
      unsignedJson,
      apiKey
    );

  const a =
    Buffer.from(
      expected,
      "utf8"
    );

  const b =
    Buffer.from(
      receivedSign,
      "utf8"
    );

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    a,
    b
  );
}

export async function heleketRequest<
  T
>(
  path: string,
  body: Record<
    string,
    unknown
  >
): Promise<T> {
  const {
    merchantId,
    apiKey,
  } = getConfig();

  const rawBody =
    JSON.stringify(body);

  const sign =
    createHeleketSign(
      rawBody,
      apiKey
    );

  const response =
    await fetch(
      `${HELEKET_API}${path}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          merchant:
            merchantId,

          sign,
        },

        body:
          rawBody,

        cache:
          "no-store",
      }
    );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      `Heleket HTTP ${response.status}`
    );
  }

  return result as T;
}
