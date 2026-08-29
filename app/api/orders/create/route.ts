import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  bytesToReadable,
  calculateRetailPrice,
} from "@/lib/pricing";

type CreateOrderBody = {
  packageCode?: string;
  country?: string;
};

type EsimPackage = {
  packageCode: string;
  name?: string;
  price: number;
  currencyCode?: string;
  volume?: number;
  duration?: number;
  durationUnit?: string;
  location?: string;
  locationCode?: string;
};

type PackageListResponse = {
  success: boolean;
  errorCode?: string;
  errorMsg?: string | null;
  obj?: {
    packageList?: EsimPackage[];
  };
};

export async function POST(
  request: Request
) {
  try {
    /*
     * 1. Получаем данные заказа
     */
    const body =
      (await request.json()) as CreateOrderBody;

    const packageCode =
      body.packageCode?.trim();

    const country =
      body.country
        ?.trim()
        .toUpperCase();

    if (!packageCode) {
      return Response.json(
        {
          success: false,
          error:
            "packageCode is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!country) {
      return Response.json(
        {
          success: false,
          error:
            "country is required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * 2. Проверяем настройки eSIMAccess
     */
    const accessCode =
      process.env.ESIM_ACCESS_CODE;

    if (!accessCode) {
      console.error(
        "ESIM_ACCESS_CODE is missing"
      );

      return Response.json(
        {
          success: false,
          error:
            "eSIM provider is not configured",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * 3. Запрашиваем актуальный тариф
     * напрямую у eSIMAccess.
     *
     * Цена никогда не принимается
     * от клиента.
     */
    const esimResponse =
      await fetch(
        "https://api.esimaccess.com/api/v1/open/package/list",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "RT-AccessCode":
              accessCode,
          },

          body: JSON.stringify({
            locationCode:
              country,
          }),

          cache: "no-store",
        }
      );

    if (!esimResponse.ok) {
      console.error(
        "eSIMAccess HTTP error:",
        esimResponse.status
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to load package from provider",
        },
        {
          status: 502,
        }
      );
    }

    const esimData =
      (await esimResponse.json()) as PackageListResponse;

    if (!esimData.success) {
      console.error(
        "eSIMAccess API error:",
        esimData.errorCode,
        esimData.errorMsg
      );

      return Response.json(
        {
          success: false,
          error:
            "Provider rejected package request",
        },
        {
          status: 502,
        }
      );
    }

    const packages =
      esimData.obj?.packageList ??
      [];

    /*
     * 4. Ищем именно тот пакет,
     * который выбрал клиент.
     */
    const selectedPackage =
      packages.find(
        (item) =>
          item.packageCode ===
          packageCode
      );

    if (!selectedPackage) {
      return Response.json(
        {
          success: false,
          error:
            "Package not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * 5. Считаем закупочную цену.
     *
     * eSIMAccess возвращает цену
     * в своих минимальных единицах:
     * 52800 = $5.28.
     */
    const supplierCost =
      Number(
        selectedPackage.price
      ) / 10000;

    if (
      !Number.isFinite(
        supplierCost
      ) ||
      supplierCost <= 0
    ) {
      console.error(
        "Invalid supplier cost:",
        selectedPackage.price
      );

      return Response.json(
        {
          success: false,
          error:
            "Invalid provider price",
        },
        {
          status: 502,
        }
      );
    }

    /*
     * 6. Рассчитываем нашу цену WYLD ROAM.
     */
    const retailPrice =
      calculateRetailPrice(
        supplierCost
      );

    /*
     * 7. Готовим отображаемый объём.
     */
    const dataLabel =
      selectedPackage.volume
        ? bytesToReadable(
            selectedPackage.volume
          )
        : "Data";

    /*
     * 8. Проверяем Telegram initData.
     *
     * Если заказ создаётся внутри Telegram,
     * он будет привязан к пользователю.
     *
     * При обычном localhost тесте
     * Telegram может отсутствовать —
     * тогда user_id останется null.
     */
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      ) ?? "";

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    const supabase =
      getSupabaseAdmin();

    let roamUserId:
      string | null = null;

    /*
     * 9. Если Telegram-пользователь
     * настоящий — создаём или обновляем
     * его запись в roam_users.
     */
    if (telegramUser) {
      const {
        data: roamUser,
        error: userError,
      } = await supabase
        .from("roam_users")
        .upsert(
          {
            telegram_user_id:
              telegramUser.id,

            telegram_username:
              telegramUser.username ??
              null,

            first_name:
              telegramUser.first_name ??
              null,

            last_name:
              telegramUser.last_name ??
              null,

            language_code:
              telegramUser.language_code ??
              null,
          },
          {
            onConflict:
              "telegram_user_id",
          }
        )
        .select("id")
        .single();

      if (userError) {
        console.error(
          "Telegram user upsert error:",
          userError
        );

        return Response.json(
          {
            success: false,
            error:
              "Failed to save Telegram user",
          },
          {
            status: 500,
          }
        );
      }

      if (roamUser) {
        roamUserId =
          roamUser.id;
      }
    }

    /*
     * 10. Создаём реальный заказ
     * в Supabase.
     *
     * supplier_cost сохраняем только
     * внутри нашей базы.
     */
    const {
      data: order,
      error: orderError,
    } = await supabase
      .from("roam_orders")
      .insert({
        user_id:
          roamUserId,

        package_code:
          selectedPackage.packageCode,

        country_code:
          country,

        plan_name:
          selectedPackage.name ??
          `${country} eSIM`,

        data_label:
          dataLabel,

        duration:
          selectedPackage.duration ??
          null,

        duration_unit:
          selectedPackage.durationUnit ??
          null,

        supplier_cost:
          supplierCost,

        amount:
          retailPrice,

        currency:
          "USD",

        status:
          "pending_payment",
      })
      .select(
        `
        id,
        package_code,
        country_code,
        plan_name,
        data_label,
        duration,
        duration_unit,
        amount,
        currency,
        status,
        created_at
        `
      )
      .single();

    if (
      orderError ||
      !order
    ) {
      console.error(
        "Create order error:",
        orderError
      );

      return Response.json(
        {
          success: false,
          error:
            "Failed to create order",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * 11. Возвращаем клиенту
     * только безопасные данные.
     *
     * Закупочную цену supplier_cost
     * наружу НЕ отправляем.
     */
    return Response.json({
      success: true,

      order: {
        id:
          order.id,

        status:
          order.status,

        packageCode:
          order.package_code,

        country:
          order.country_code,

        planName:
          order.plan_name,

        data:
          order.data_label,

        duration:
          order.duration,

        durationUnit:
          order.duration_unit,

        amount:
          Number(
            order.amount
          ),

        currency:
          order.currency,

        createdAt:
          order.created_at,
      },
    });
  } catch (error) {
    console.error(
      "Create order unexpected error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to create order",
      },
      {
        status: 500,
      }
    );
  }
}
