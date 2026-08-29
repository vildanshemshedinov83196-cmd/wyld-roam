import {
  verifyTelegramInitData,
} from "@/lib/telegram-auth";

import {
  getSupabaseAdmin,
} from "@/lib/supabase-admin";

import {
  getEsimAccessBalance,
  orderEsim,
  waitForEsimProfile,
  parseActivationCode,
} from "@/lib/esimaccess";

export async function POST(
  request: Request
) {
  try {
    const initData =
      request.headers.get(
        "x-telegram-init-data"
      ) ?? "";

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    if (!telegramUser) {
      return Response.json(
        {
          success: false,
          error:
            "Telegram authorization required",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const orderId =
      String(
        body?.orderId ?? ""
      ).trim();

    if (!orderId) {
      return Response.json(
        {
          success: false,
          error:
            "orderId is required",
        },
        {
          status: 400,
        }
      );
    }

    const supabase =
      getSupabaseAdmin();

    /*
     * ============================================
     * USER
     * ============================================
     */

    const {
      data: user,
      error: userError,
    } = await supabase
      .from("roam_users")
      .select("id, role")
      .eq(
        "telegram_user_id",
        telegramUser.id
      )
      .maybeSingle();

    if (
      userError ||
      !user
    ) {
      return Response.json(
        {
          success: false,
          error:
            "User not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * ============================================
     * ORDER
     * ============================================
     */

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
      return Response.json(
        {
          success: false,
          error:
            "Order not found",
        },
        {
          status: 404,
        }
      );
    }

    if (
      order.user_id !==
        user.id &&
      user.role !==
        "owner"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Forbidden",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * ============================================
     * PAYMENT
     * ============================================
     */

    const {
      data: payments,
      error: paymentError,
    } = await supabase
      .from("roam_payments")
      .select(
        `
        id,
        stars_amount,
        status
        `
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
      .limit(1);

    if (paymentError) {
      throw paymentError;
    }

    const payment =
      payments?.[0];

    if (!payment) {
      return Response.json(
        {
          success: false,
          error:
            "Paid Telegram Stars payment not found",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================
     * EXISTING ESIM
     * ============================================
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
        qr_code,
        activation_code,
        smdp_address,
        status
        `
      )
      .eq(
        "order_id",
        order.id
      )
      .maybeSingle();

    if (existingEsimError) {
      throw existingEsimError;
    }

    /*
     * Если профиль уже полностью готов —
     * ничего у поставщика больше не покупаем.
     */
    if (
      existingEsim?.status ===
        "ready" &&
      existingEsim.iccid
    ) {
      return Response.json({
        success: true,
        alreadyReady: true,

        esim: {
          id:
            existingEsim.id,

          status:
            existingEsim.status,

          iccid:
            existingEsim.iccid,
        },
      });
    }

    /*
     * Если orderNo уже сохранён,
     * заказ уже был сделан.
     *
     * Только продолжаем получать профиль.
     */
    if (
      existingEsim
        ?.supplier_order_id
    ) {
      const profile =
        await waitForEsimProfile(
          existingEsim
            .supplier_order_id,
          {
            attempts: 6,
            delayMs: 5000,
          }
        );

      if (!profile) {
        return Response.json({
          success: true,

          pending: true,

          message:
            "eSIM ordered and still provisioning",
        });
      }

      const activation =
        parseActivationCode(
          profile.ac
        );

      const remainingData =
        Math.max(
          Number(
            profile.totalVolume ??
              0
          ) -
            Number(
              profile.orderUsage ??
                0
            ),
          0
        );

      const {
        error: updateError,
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
          existingEsim.id
        );

      if (updateError) {
        throw updateError;
      }

      await supabase
        .from("roam_orders")
        .update({
          status:
            "esim_ready",
        })
        .eq(
          "id",
          order.id
        );

      return Response.json({
        success: true,

        ready: true,

        esim: {
          id:
            existingEsim.id,

          iccid:
            profile.iccid,
        },
      });
    }

    /*
     * ============================================
     * NEW PURCHASE
     * ============================================
     */

    if (
      order.status !==
        "paid" &&
      order.status !==
        "ordering_esim"
    ) {
      return Response.json(
        {
          success: false,
          error:
            `Order cannot be issued from status: ${order.status}`,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Атомарно забираем заказ,
     * если он ещё paid.
     */
    if (
      order.status ===
      "paid"
    ) {
      const {
        data: claimedOrder,
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

      if (!claimedOrder) {
        return Response.json(
          {
            success: false,
            error:
              "Order is already being processed",
          },
          {
            status: 409,
          }
        );
      }
    }

    /*
     * Создаём резервную запись.
     *
     * order_id UNIQUE не позволяет
     * создать вторую eSIM для заказа.
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
        throw reserveError;
      }

      esimId =
        reserved.id;
    }

    /*
     * Проверяем баланс поставщика.
     */
    const supplierCost =
      Number(
        order.supplier_cost ??
          0
      );

    const balance =
      await getEsimAccessBalance();

    if (
      supplierCost <= 0
    ) {
      throw new Error(
        "Invalid supplier cost"
      );
    }

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

      return Response.json(
        {
          success: false,
          error:
            "Insufficient supplier balance",
        },
        {
          status: 409,
        }
      );
    }

    /*
     * ============================================
     * REAL ESIMACCESS PURCHASE
     * ============================================
     *
     * Детерминированный transactionId.
     *
     * Повтор для этого же orderId
     * использует тот же transactionId.
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

    /*
     * Сразу сохраняем supplier orderNo.
     *
     * После этого повторный запрос
     * больше НЕ вызывает orderEsim.
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
     * ============================================
     * WAIT FOR PROFILE
     * ============================================
     */

    const profile =
      await waitForEsimProfile(
        supplierOrder.orderNo,
        {
          attempts: 6,
          delayMs: 5000,
        }
      );

    /*
     * Покупка уже состоялась,
     * но eSIM может ещё provision-иться.
     *
     * В этом случае НЕ ставим failed.
     */
    if (!profile) {
      return Response.json({
        success: true,

        pending: true,

        supplierOrderNo:
          supplierOrder.orderNo,

        message:
          "eSIM purchased and provisioning",
      });
    }

    const activation =
      parseActivationCode(
        profile.ac
      );

    const remainingData =
      Math.max(
        Number(
          profile.totalVolume ??
            0
        ) -
          Number(
            profile.orderUsage ??
              0
          ),
        0
      );

    /*
     * ============================================
     * SAVE PROFILE
     * ============================================
     */

    const {
      error:
        profileSaveError,
    } = await supabase
      .from("roam_esims")
      .update({
        iccid:
          profile.iccid ??
          null,

        /*
         * qr_code сейчас хранит URL QR.
         * Если URL нет, сохраняем LPA.
         */
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

    if (
      profileSaveError
    ) {
      throw profileSaveError;
    }

    await supabase
      .from("roam_orders")
      .update({
        status:
          "esim_ready",
      })
      .eq(
        "id",
        order.id
      );

    return Response.json({
      success: true,

      ready: true,

      esim: {
        id:
          esimId,

        iccid:
          profile.iccid,

        status:
          "ready",
      },
    });
  } catch (error) {
    console.error(
      "eSIM issuance error:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          "Failed to issue eSIM",
      },
      {
        status: 500,
      }
    );
  }
}
