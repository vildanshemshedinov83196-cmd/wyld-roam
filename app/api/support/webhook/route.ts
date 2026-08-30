import { NextRequest, NextResponse } from "next/server";

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
    reply_to_message?: {
      text?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
  };
};

const BOT_TOKEN =
  process.env.SUPPORT_BOT_TOKEN;

const OWNER_CHAT_ID =
  process.env.SUPPORT_OWNER_CHAT_ID;

const CATEGORY_PREFIX =
  "support_category:";

const supportCategories =
  new Map<number, string>();

function apiUrl(method: string) {
  if (!BOT_TOKEN) {
    throw new Error(
      "SUPPORT_BOT_TOKEN is not configured"
    );
  }

  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

async function telegram(
  method: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    apiUrl(method),
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  const result =
    await response.json();

  if (!response.ok || !result.ok) {
    console.error(
      "Support Telegram API error:",
      method,
      result
    );

    throw new Error(
      `Telegram ${method} failed`
    );
  }

  return result;
}

function categoryName(
  category: string
) {
  if (category === "payment") {
    return "Проблема с оплатой";
  }

  if (category === "esim") {
    return "Проблема с eSIM";
  }

  return "Другой вопрос";
}

async function sendWelcome(
  chatId: number
) {
  supportCategories.delete(chatId);

  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      "Добро пожаловать в поддержку WYLD ROAM.\n\n" +
      "Выберите тему обращения:",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text:
              "💳 Проблема с оплатой",
            callback_data:
              `${CATEGORY_PREFIX}payment`,
          },
        ],
        [
          {
            text:
              "📶 Проблема с eSIM",
            callback_data:
              `${CATEGORY_PREFIX}esim`,
          },
        ],
        [
          {
            text:
              "💬 Другой вопрос",
            callback_data:
              `${CATEGORY_PREFIX}other`,
          },
        ],
      ],
    },
  });
}

async function handleCategory(
  update: NonNullable<
    TelegramUpdate["callback_query"]
  >
) {
  const data =
    update.data ?? "";

  const category =
    data.replace(
      CATEGORY_PREFIX,
      ""
    );

  const chatId =
    update.message?.chat.id;

  if (!chatId) {
    return;
  }

  supportCategories.set(
    chatId,
    category
  );

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id:
        update.id,
    }
  );

  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      `Вы выбрали: ${categoryName(
        category
      )}.\n\n` +
      "Опишите проблему одним сообщением. " +
      "Если вопрос связан с заказом, укажите страну и приблизительное время покупки.",
    reply_markup: {
      force_reply: true,
      input_field_placeholder:
        "Опишите проблему...",
    },
  });
}

function parseClientId(
  text?: string
) {
  if (!text) {
    return null;
  }

  const match =
    text.match(
      /Telegram ID:\s*(\d+)/
    );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

async function handleOwnerReply(
  message: NonNullable<
    TelegramUpdate["message"]
  >
) {
  if (
    !OWNER_CHAT_ID ||
    String(message.chat.id) !==
      String(OWNER_CHAT_ID)
  ) {
    return false;
  }

  const replyText =
    message.text?.trim();

  const repliedMessage =
    message.reply_to_message?.text;

  if (
    !replyText ||
    !repliedMessage
  ) {
    return false;
  }

  const clientId =
    parseClientId(
      repliedMessage
    );

  if (!clientId) {
    return false;
  }

  await telegram(
    "sendMessage",
    {
      chat_id: clientId,
      text:
        "💬 Ответ поддержки WYLD ROAM\n\n" +
        replyText,
    }
  );

  await telegram(
    "sendMessage",
    {
      chat_id:
        OWNER_CHAT_ID,
      text:
        "✅ Ответ отправлен клиенту.",
    }
  );

  return true;
}

async function forwardToOwner(
  message: NonNullable<
    TelegramUpdate["message"]
  >
) {
  if (!OWNER_CHAT_ID) {
    throw new Error(
      "SUPPORT_OWNER_CHAT_ID is not configured"
    );
  }

  const text =
    message.text?.trim();

  if (!text) {
    await telegram(
      "sendMessage",
      {
        chat_id:
          message.chat.id,
        text:
          "Пока поддерживаются текстовые обращения. " +
          "Опишите проблему сообщением.",
      }
    );

    return;
  }

  if (text === "/start") {
    return;
  }

  const user =
    message.from;

  const fullName = [
    user?.first_name,
    user?.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const username =
    user?.username
      ? `@${user.username}`
      : "нет";

  const repliedText =
    message.reply_to_message?.text ?? "";

  let category =
    supportCategories.get(
      message.chat.id
    ) ?? "other";

  if (
    repliedText.includes(
      "Проблема с оплатой"
    )
  ) {
    category = "payment";
  } else if (
    repliedText.includes(
      "Проблема с eSIM"
    )
  ) {
    category = "esim";
  } else if (
    repliedText.includes(
      "Другой вопрос"
    )
  ) {
    category = "other";
  }

  const ownerText =
    "🆘 Новое обращение WYLD ROAM\n\n" +
    `Категория: ${categoryName(
      category
    )}\n` +
    `Имя: ${fullName || "не указано"}\n` +
    `Username: ${username}\n` +
    `Telegram ID: ${message.chat.id}\n\n` +
    `Сообщение:\n${text}\n\n` +
    "↩️ Чтобы ответить клиенту, ответьте прямо на это сообщение.";

  await telegram(
    "sendMessage",
    {
      chat_id:
        OWNER_CHAT_ID,
      text: ownerText,
    }
  );

  supportCategories.delete(
    message.chat.id
  );

  await telegram(
    "sendMessage",
    {
      chat_id:
        message.chat.id,
      text:
        "✅ Обращение отправлено в поддержку.\n\n" +
        "Мы получили ваше сообщение и ответим здесь, в Telegram.",
    }
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    const update =
      (await request.json()) as TelegramUpdate;

    if (
      update.callback_query?.data?.startsWith(
        CATEGORY_PREFIX
      )
    ) {
      await handleCategory(
        update.callback_query
      );

      return NextResponse.json({
        ok: true,
      });
    }

    if (update.message) {
      if (
        await handleOwnerReply(
          update.message
        )
      ) {
        return NextResponse.json({
          ok: true,
        });
      }

      if (
        update.message.text ===
        "/start"
      ) {
        await sendWelcome(
          update.message.chat.id
        );

        return NextResponse.json({
          ok: true,
        });
      }

      await forwardToOwner(
        update.message
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Support webhook error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service:
      "WYLD ROAM Support webhook",
  });
}
