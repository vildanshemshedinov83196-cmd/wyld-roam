import crypto from "crypto";

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export function verifyTelegramInitData(
  initData: string
): TelegramUser | null {
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken || !initData) {
    return null;
  }

  const params =
    new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = Array.from(
    params.entries()
  )
    .sort(([a], [b]) =>
      a.localeCompare(b)
    )
    .map(
      ([key, value]) =>
        `${key}=${value}`
    )
    .join("\n");

  const secretKey = crypto
    .createHmac(
      "sha256",
      "WebAppData"
    )
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac(
      "sha256",
      secretKey
    )
    .update(dataCheckString)
    .digest("hex");

  const hashBuffer =
    Buffer.from(hash, "hex");

  const expectedBuffer =
    Buffer.from(
      expectedHash,
      "hex"
    );

  if (
    hashBuffer.length !==
    expectedBuffer.length
  ) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      hashBuffer,
      expectedBuffer
    )
  ) {
    return null;
  }

  const authDate =
    Number(
      params.get("auth_date")
    );

  if (!authDate) {
    return null;
  }

  const now =
    Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
    return null;
  }

  const userRaw =
    params.get("user");

  if (!userRaw) {
    return null;
  }

  try {
    return JSON.parse(
      userRaw
    ) as TelegramUser;
  } catch {
    return null;
  }
}
