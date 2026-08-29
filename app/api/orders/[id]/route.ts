import { getSupabaseAdmin } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const supabase = getSupabaseAdmin();

    const { data: order, error } =
      await supabase
        .from("roam_orders")
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
        .eq("id", id)
        .single();

    if (error || !order) {
      return Response.json(
        {
          success: false,
          error: "Order not found",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      order: {
        id: order.id,
        packageCode: order.package_code,
        country: order.country_code,
        planName: order.plan_name,
        data: order.data_label,
        duration: order.duration,
        durationUnit: order.duration_unit,
        amount: Number(order.amount),
        currency: order.currency,
        status: order.status,
        createdAt: order.created_at,
      },
    });
  } catch (error) {
    console.error(
      "WYLD ROAM get order error:",
      error
    );

    return Response.json(
      {
        success: false,
        error: "Failed to load order",
      },
      { status: 500 }
    );
  }
}
