import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Supabase environment variables are not configured"
    );
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
