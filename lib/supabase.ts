import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getEmployee(employeeId: string) {
  const { data, error } = await getSupabaseAdmin().from("employees").select("*").eq("id", employeeId).single();
  if (error || !data) throw new Error("Employee not found");
  return data;
}

export async function getLinkedChat(employeeId: string): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("telegram_links")
    .select("chat_id")
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data?.chat_id ?? null;
}
