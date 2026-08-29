import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  getEsimAccessBalance,
  orderEsim,
  queryEsimByOrderNo,
  waitForEsimProfile,
  parseActivationCode,
} from "@/lib/esimaccess";

type IssueOptions = {
  waitForProfile?: boolean;
};

async function saveProfile(
  esimId: string,
  orderId: string,
  profile: any
) {
  const supabase =
    getSupabaseAdmin();

  const activation =
    parseActivationCode(
      profile.ac
    );

  const totalVolume =
    Number(
      profile.totalVolume ?? 0
    );

  const orderUsage =
    Number(
      profile.orderUsage ?? 0
    );

  const remainingData =
    Math.max(
      totalVolume -
        orderUsage,
      0
    );

  const {
    error: esimError,
  } = await supabase
    .from("roam_esims")
    .update({
      iccid:
        profile.iccid ??
        null,

      qr_code:
        profile.qrCodeUrl ??
        profile.ac ??
        null,

      activation_code:
        activation.activationCode,

      smdp_address:
        activation.smdpAddress,

      status:
        "ready",

      remaining_data_bytes:
        remainingData,

      expires_at:
        profile.expiredTime ??
        null,

      last_error:
        null,
    })
    .eq(
      "id",
      esimId
    );

  if (esimError) {
    throw esimError;
  }

  const {
    error: orderError,
  } = await supabase
    .from("roam_orders")
    .update({
      status:
        "esim_ready",
    })
    .eq(
      "id",
      orderId
    );

  if (orderError) {
    throw orderError;
  }

  return {
    success: true,
    ready: true,
    esim: {
      id: esimId,
      iccid:
        profile.iccid ??
        null,
      status:
        "ready",
    },
  };
}

export async function issueEsimForOrder(
  orderId: string,
  options: IssueOptions = {}
) {
  const supabase =
    getSupabaseAdmin();

  const waitForProfile =
    options.waitForProfile ??
    true;

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from("roam_orders")
    .select(
      `
      id,
      user_id,
      package_code,
      country_code,
      supplier_cost,
      amount,
      status
      `
    )
    .eq(
      "id",
      orderId
    )
    .maybeSingle();

  if (
    orderError ||
    !order
  ) {
    throw new Error(
      "Order not found"
    );
  }

  /*
   * Реальная оплата обязательна.
   */
  const {
    data: payment,
    error: paymentError,
  } = await supabase
    .from("roam_payments")
    .select(
      "id, status"
    )
    .eq(
      "order_id",
      order.id
    )
    .eq(
      "provider",
      "telegram_stars"
    )
    .eq(
      "status",
      "paid"
    )
    .limit(1)
    .maybeSingle();

  if (
    paymentError ||
    !payment
  ) {
    throw new Error(
      "Paid Telegram Stars payment not found"
    );
  }

  /*
   * Проверяем существующую eSIM.
   */
  const {
    data: existingEsim,
    error:
      existingEsimError,
  } = await supabase
    .from("roam_esims")
    .select(
      `
      id,
      supplier_order_id,
      iccid,
      status
      `
    )
    .eq(
      "order_id",
      order.id
    )
    .maybeSingle();

  if (
    existingEsimError
  ) {
    throw existingEsimError;
  }

  /*
   * Полностью готовая eSIM:
   * ничего больше не делаем.
   */
  if (
    existingEsim?.status ===
      "ready" &&
    existingEsim.iccid
  ) {
    return {
      success: true,
      alreadyReady: true,
      esim: {
        id:
          existingEsim.id,
        iccid:
          existingEsim.iccid,
        status:
          "ready",
      },
    };
  }

  /*
   * supplier_order_id уже есть:
   * eSIM уже КУПЛЕНА.
   *
   * Никакого второго orderEsim().
   */
  if (
    existingEsim
      ?.supplier_order_id
  ) {
    const profile =
      waitForProfile
        ? await waitForEsimProfile(
            existingEsim
              .supplier_order_id,
            {
              attempts: 6,
              delayMs: 5000,
            }
          )
        : await queryEsimByOrderNo(
            existingEsim
              .supplier_order_id
          );

    if (!profile) {
      return {
        success: true,
        pending: true,
        supplierOrderNo:
          existingEsim
            .supplier_order_id,
      };
    }

    return saveProfile(
      existingEsim.id,
      order.id,
      profile
    );
  }

  /*
   * Новый выпуск допустим только
   * после оплаты.
   */
  if (
    order.status !==
      "paid" &&
    order.status !==
      "ordering_esim"
  ) {
    throw new Error(
      `Order cannot be issued from status: ${order.status}`
    );
  }

  /*
   * Забираем заказ в обработку.
   */
  if (
    order.status ===
    "paid"
  ) {
    const {
      data: claimed,
      error: claimError,
    } = await supabase
      .from("roam_orders")
      .update({
        status:
          "ordering_esim",
      })
      .eq(
        "id",
        order.id
      )
      .eq(
        "status",
        "paid"
      )
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    if (!claimed) {
      return {
        success: true,
        pending: true,
      };
    }
  }

  /*
   * Резервируем ровно одну запись.
   */
  let esimId =
    existingEsim?.id ??
    null;

  if (!esimId) {
    const {
      data: reserved,
      error: reserveError,
    } = await supabase
      .from("roam_esims")
      .insert({
        order_id:
          order.id,

        user_id:
          order.user_id,

        package_code:
          order.package_code,

        country_code:
          order.country_code,

        status:
          "pending",
      })
      .select("id")
      .single();

    if (reserveError) {
      /*
       * Если параллельный запрос уже
       * успел создать строку —
       * перечитываем её.
       */
      const {
        data: concurrent,
      } = await supabase
        .from("roam_esims")
        .select(
          "id, supplier_order_id"
        )
        .eq(
          "order_id",
          order.id
        )
        .maybeSingle();

      if (
        concurrent
          ?.supplier_order_id
      ) {
        return {
          success: true,
          pending: true,
          supplierOrderNo:
            concurrent
              .supplier_order_id,
        };
      }

      if (!concurrent) {
        throw reserveError;
      }

      esimId =
        concurrent.id;
    } else {
      esimId =
        reserved.id;
    }
  }

  if (!esimId) {
    throw new Error(
      "Unable to reserve eSIM"
    );
  }

  const supplierCost =
    Number(
      order.supplier_cost ??
        0
    );

  if (
    !Number.isFinite(
      supplierCost
    ) ||
    supplierCost <= 0
  ) {
    throw new Error(
      "Invalid supplier cost"
    );
  }

  const balance =
    await getEsimAccessBalance();

  if (
    balance <
    supplierCost
  ) {
    await supabase
      .from("roam_esims")
      .update({
        status:
          "failed",

        last_error:
          "Insufficient eSIMAccess balance",
      })
      .eq(
        "id",
        esimId
      );

    await supabase
      .from("roam_orders")
      .update({
        status:
          "failed",
      })
      .eq(
        "id",
        order.id
      );

    throw new Error(
      "Insufficient supplier balance"
    );
  }

  /*
   * Один и тот же заказ ВСЕГДА
   * получает один transactionId.
   */
  const transactionId =
    `wyld_roam_${order.id}`;

  const supplierOrder =
    await orderEsim({
      transactionId,

      packageCode:
        order.package_code,

      supplierCost,
    });

  if (
    !supplierOrder
      ?.orderNo
  ) {
    throw new Error(
      "eSIMAccess order number missing"
    );
  }

  /*
   * Сохраняем orderNo СРАЗУ.
   *
   * После этого система никогда
   * не делает вторую покупку
   * для этого заказа.
   */
  const {
    error:
      supplierSaveError,
  } = await supabase
    .from("roam_esims")
    .update({
      supplier_order_id:
        supplierOrder.orderNo,

      status:
        "pending",

      last_error:
        null,
    })
    .eq(
      "id",
      esimId
    );

  if (
    supplierSaveError
  ) {
    throw supplierSaveError;
  }

  /*
   * В Telegram webhook долго не ждём.
   * Профиль может создаваться 10–30 секунд.
   */
  const profile =
    waitForProfile
      ? await waitForEsimProfile(
          supplierOrder.orderNo,
          {
            attempts: 6,
            delayMs: 5000,
          }
        )
      : await queryEsimByOrderNo(
          supplierOrder.orderNo
        );

  if (!profile) {
    return {
      success: true,
      pending: true,
      supplierOrderNo:
        supplierOrder.orderNo,
    };
  }

  return saveProfile(
    esimId,
    order.id,
    profile
  );
}
