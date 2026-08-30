import crypto from "crypto";

const TBANK_API =
  "https://securepay.tinkoff.ru/v2";

function getConfig() {
  const terminalKey =
    process.env.TBANK_TERMINAL_KEY;

  const password =
    process.env.TBANK_PASSWORD;

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

  const response =
    await fetch(
      `${TBANK_API}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify(
            signedBody
          ),
        cache: "no-store",
      }
    );

  const text =
    await response.text();

  let data: unknown;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `T-Bank ${method}: invalid JSON: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `T-Bank ${method} HTTP ${response.status}: ${text}`
    );
  }

  return data as T;
}
