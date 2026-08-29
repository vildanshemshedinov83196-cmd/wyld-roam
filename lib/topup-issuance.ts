import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

type TopupResult =
  | {
      success: true;
      completed: true;
      alreadyCompleted?: boolean;
      topupId: string;
    }
  | {
      success: true;
      completed: false;
      processing?: boolean;
      topupId: string;
    };

function parseSupplierDate(
  value?: string | null
) {
  if (!value) return null;

  const normalized = value.replace(
    /([+-]\d{2})(\d{2})$/,
    "$1:$2"
  );

  const date = new Date(normalized);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}

export async function topupEsimForOrder(
  topupId: string
): Promise<TopupResult> {
  const supabase =
    getSupabaseAdmin();

  const {
    data: topup,
    error: topupError,
  } = await supabase
    .from("roam_topups")
    .select(
      `
      id,
      esim_id,
      iccid,
      slug,
      package_code,
      supplier_cost,
      status,
      supplier_transaction_id
      `
    )
    .eq("id", topupId)
    .maybeSingle();

  if (
    topupError ||
    !topup
  ) {
    throw new Error(
      "Top Up not found"
    );
  }

  if (
    topup.status ===
    "completed"
  ) {
    return {
      success: true,
      completed: true,
      alreadyCompleted: true,
      topupId,
    };
  }

  if (
    topup.status ===
    "processing"
  ) {
    /*
     * ВАЖНО:
     * повторно eSIMAccess здесь не вызываем.
     *
     * Если предыдущий запрос оборвался
     * после отправки поставщику,
     * автоматический повтор потенциально
     * мог бы сделать двойной Top Up.
     */
    return {
      success: true,
      completed: false,
      processing: true,
      topupId,
    };
  }

  if (
    topup.status !== "paid"
  ) {
    throw new Error(
      `Top Up cannot be processed from status ${topup.status}`
    );
  }

  const transactionId =
    topup.supplier_transaction_id ||
    `wyld_roam_topup_${topup.id}`;

  /*
   * Атомарно резервируем обработку.
   * Только один запрос сможет перевести
   * paid -> processing.
   */
  const {
    data: reserved,
    error: reserveError,
  } = await supabase
    .from("roam_topups")
    .update({
      status:
        "processing",

      supplier_transaction_id:
        transactionId,

      updated_at:
        new Date().toISOString(),

      last_error:
        null,
    })
    .eq("id", topup.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();

  if (reserveError) {
    throw reserveError;
  }

  if (!reserved) {
    const {
      data: current,
    } = await supabase
      .from("roam_topups")
      .select("status")
      .eq("id", topup.id)
      .maybeSingle();

    if (
      current?.status ===
      "completed"
    ) {
      return {
        success: true,
        completed: true,
        alreadyCompleted: true,
        topupId,
      };
    }

    return {
      success: true,
      completed: false,
      processing: true,
      topupId,
    };
  }

  const accessCode =
    process.env.ESIM_ACCESS_CODE;

  if (!accessCode) {
    await supabase
      .from("roam_topups")
      .update({
        status: "paid",
        last_error:
          "ESIM_ACCESS_CODE is not configured",
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", topup.id)
      .eq(
        "status",
        "processing"
      );

    throw new Error(
      "ESIM_ACCESS_CODE is not configured"
    );
  }

  const supplierAmount =
    Math.round(
      Number(
        topup.supplier_cost
      ) * 10000
    );

  let response: Response;

  try {
    response = await fetch(
      "https://api.esimaccess.com/api/v1/open/esim/topup",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "RT-AccessCode":
            accessCode,
        },

        /*
         * eSIMAccess принимает slug
         * в поле packageCode.
         *
         * amount оставляем, чтобы
         * поставщик отказал при
         * неожиданном изменении цены.
         */
        body: JSON.stringify({
          iccid:
            topup.iccid,

          packageCode:
            topup.slug,

          transactionId,

          amount:
            supplierAmount,
        }),

        cache: "no-store",
      }
    );
  } catch (error) {
    /*
     * Не переводим обратно в paid.
     *
     * Мы не можем гарантировать,
     * был ли запрос получен поставщиком
     * до сетевого обрыва.
     * Это защищает от двойного списания.
     */
    await supabase
      .from("roam_topups")
      .update({
        last_error:
          error instanceof Error
            ? error.message
            : "Supplier network error",

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", topup.id);

    throw error;
  }

  let result: any = null;

  try {
    result =
      await response.json();
  } catch {
    await supabase
      .from("roam_topups")
      .update({
        last_error:
          `Supplier returned HTTP ${response.status} without JSON`,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", topup.id);

    throw new Error(
      "Invalid eSIMAccess Top Up response"
    );
  }

  if (
    !response.ok ||
    result?.success !== true
  ) {
    const supplierMessage =
      result?.errorMsg ||
      `eSIMAccess Top Up failed: HTTP ${response.status}`;

    /*
     * Если eSIMAccess явно вернул
     * бизнес-ошибку, запрос завершён
     * и его можно пометить failed.
     */
    await supabase
      .from("roam_topups")
      .update({
        status:
          "failed",

        supplier_response:
          result,

        last_error:
          supplierMessage,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", topup.id);

    throw new Error(
      supplierMessage
    );
  }

  const supplierObject =
    result?.obj ?? {};

  const totalVolume =
    Number(
      supplierObject.totalVolume
    );

  const orderUsage =
    Number(
      supplierObject.orderUsage
    );

  let remaining:
    number | null = null;

  if (
    Number.isFinite(
      totalVolume
    ) &&
    Number.isFinite(
      orderUsage
    )
  ) {
    remaining =
      Math.max(
        totalVolume -
          orderUsage,
        0
      );
  }

  const expiresAt =
    parseSupplierDate(
      supplierObject.expiredTime
    );

  const now =
    new Date().toISOString();

  const {
    error:
      completedError,
  } = await supabase
    .from("roam_topups")
    .update({
      status:
        "completed",

      supplier_response:
        result,

      last_error:
        null,

      completed_at:
        now,

      updated_at:
        now,
    })
    .eq("id", topup.id)
    .eq(
      "status",
      "processing"
    );

  if (completedError) {
    throw completedError;
  }

  const esimUpdate:
    Record<string, unknown> = {
      updated_at:
        now,
    };

  if (remaining !== null) {
    esimUpdate.remaining_data_bytes =
      remaining;
  }

  if (expiresAt) {
    esimUpdate.expires_at =
      expiresAt;
  }

  const {
    error: esimUpdateError,
  } = await supabase
    .from("roam_esims")
    .update(esimUpdate)
    .eq("id", topup.esim_id);

  if (esimUpdateError) {
    console.error(
      "Top Up completed but eSIM cache update failed:",
      esimUpdateError
    );
  }

  return {
    success: true,
    completed: true,
    topupId,
  };
}
