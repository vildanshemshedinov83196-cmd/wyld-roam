import { NextRequest, NextResponse } from "next/server";

type TelegramUpdate = {
  message?: {
    message_id: number;
    text?: string;
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

async function sendWelcome(
  chatId: number
) {
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
      "Если вопрос связан с заказом, можете указать страну и приблизительное время покупки.",
    reply_markup: {
      force_reply: true,
      input_field_placeholder:
        "Опишите проблему...",
    },
  });

  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      `SUPPORT_CATEGORY:${category}`,
    disable_notification: true,
  });
}

async function getRecentCategory(
  chatId: number
) {
  /*
   * Для первой версии не храним состояние в БД.
   * Категория определяется по последнему сообщению-маркеру,
   * но Telegram Bot API не даёт читать историю.
   *
   * Поэтому если пользователь просто пишет текст,
   * считаем его общим обращением.
   *
   * Позже при желании вынесем состояние в Supabase.
   */
  return "other";
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
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text:
        "Пока поддерживаются текстовые обращения. " +
        "Опишите проблему сообщением.",
    });

    return;
  }

  if (
    text === "/start" ||
    text.startsWith(
      "SUPPORT_CATEGORY:"
    )
  ) {
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

  const category =
    await getRecentCategory(
      message.chat.id
    );

  const ownerText =
    "🆘 Новое обращение WYLD ROAM\n\n" +
    `Категория: ${categoryName(
      category
    )}\n` +
    `Имя: ${fullName || "не указано"}\n` +
    `Username: ${username}\n` +
    `Telegram ID: ${message.chat.id}\n\n` +
    `Сообщение:\n${text}`;

  await telegram("sendMessage", {
    chat_id: OWNER_CHAT_ID,
    text: ownerText,
  });

  await telegram("sendMessage", {
    chat_id: message.chat.id,
    text:
      "✅ Обращение отправлено в поддержку.\n\n" +
      "Мы получили ваше сообщение и ответим в Telegram.",
  });
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
