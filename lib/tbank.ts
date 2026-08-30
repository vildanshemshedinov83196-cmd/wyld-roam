import crypto from "crypto";
import https from "node:https";
import tls from "node:tls";

import {
  TBANK_EXTRA_CA_B64,
} from "./tbank-ca";

const TBANK_API =
  "https://securepay.tinkoff.ru/v2";

const extraCa =
  Buffer.from(
    TBANK_EXTRA_CA_B64,
    "base64"
  ).toString("utf8");

/*
 * Важно:
 * ca в https.request заменяет
 * стандартный набор CA.
 *
 * Поэтому сохраняем стандартные
 * сертификаты Node.js и добавляем
 * Russian Trusted CA.
 */
const tbankCa = [
  ...tls.rootCertificates,
  extraCa,
];

function getConfig() {
  const terminalKey =
    process.env.TBANK_TERMINAL_KEY?.trim();

  const password =
    process.env.TBANK_PASSWORD?.trim();

  if (!terminalKey) {
    throw new Error(
      "TBANK_TERMINAL_KEY is not configured"
    );
  }

  if (!password) {
    throw new Error(
      "TBANK_PASSWORD is not configured"
    );
  }

  return {
    terminalKey,
    password,
  };
}

function primitiveValue(
  value: unknown
) {
  if (value === null) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return null;
}

export function createTbankToken(
  payload: Record<
    string,
    unknown
  >
) {
  const {
    password,
  } = getConfig();

  const values: Record<
    string,
    string
  > = {};

  for (
    const [key, value]
    of Object.entries(payload)
  ) {
    if (key === "Token") {
      continue;
    }

    const primitive =
      primitiveValue(value);

    if (primitive !== null) {
      values[key] =
        primitive;
    }
  }

  values.Password =
    password;

  const source =
    Object.keys(values)
      .sort()
      .map(
        (key) =>
          values[key]
      )
      .join("");

  return crypto
    .createHash("sha256")
    .update(
      source,
      "utf8"
    )
    .digest("hex");
}

export function verifyTbankToken(
  payload: Record<
    string,
    unknown
  >
) {
  const receivedToken =
    typeof payload.Token === "string"
      ? payload.Token
      : "";

  if (!receivedToken) {
    return false;
  }

  const expectedToken =
    createTbankToken(
      payload
    );

  const a =
    Buffer.from(
      expectedToken,
      "utf8"
    );

  const b =
    Buffer.from(
      receivedToken,
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

function postTbank(
  url: string,
  body: Record<
    string,
    unknown
  >
): Promise<{
  status: number;
  text: string;
}> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const json =
        JSON.stringify(body);

      const request =
        https.request(
          url,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Content-Length":
                Buffer.byteLength(
                  json
                ),
            },

            ca:
              tbankCa,

            rejectUnauthorized:
              true,
          },
          (response) => {
            const chunks:
              Buffer[] = [];

            response.on(
              "data",
              (chunk) => {
                chunks.push(
                  Buffer.isBuffer(
                    chunk
                  )
                    ? chunk
                    : Buffer.from(
                        chunk
                      )
                );
              }
            );

            response.on(
              "end",
              () => {
                resolve({
                  status:
                    response
                      .statusCode ??
                    0,

                  text:
                    Buffer.concat(
                      chunks
                    ).toString(
                      "utf8"
                    ),
                });
              }
            );
          }
        );

      request.setTimeout(
        15000,
        () => {
          request.destroy(
            new Error(
              "T-Bank request timeout"
            )
          );
        }
      );

      request.on(
        "error",
        reject
      );

      request.write(
        json
      );

      request.end();
    }
  );
}

export async function tbankRequest<
  T
>(
  method: string,
  payload: Record<
    string,
    unknown
  >
): Promise<T> {
  const {
    terminalKey,
  } = getConfig();

  const body = {
    TerminalKey:
      terminalKey,
    ...payload,
  };

  const signedBody = {
    ...body,
    Token:
      createTbankToken(
        body
      ),
  };

  const {
    status,
    text,
  } =
    await postTbank(
      `${TBANK_API}/${method}`,
      signedBody
    );

  let data: unknown;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `T-Bank ${method}: invalid JSON: ${text}`
    );
  }

  if (
    status < 200 ||
    status >= 300
  ) {
    throw new Error(
      `T-Bank ${method} HTTP ${status}: ${text}`
    );
  }

  return data as T;
}
