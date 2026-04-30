import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _serverClient: SupabaseClient | null = null;

// Server-side client with the service-role key. Never import this from a
// "use client" file — the key would leak to the browser.
export function supabaseAdmin(): SupabaseClient {
  if (_serverClient) return _serverClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  _serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _serverClient;
}

export async function logEvent(eventName: string, battleId: string | null, meta: Record<string, unknown> = {}) {
  try {
    await supabaseAdmin().from("analytics_events").insert({
      event_name: eventName,
      battle_id: battleId,
      meta
    });
  } catch (err) {
    console.warn("analytics insert failed", eventName, err);
  }
}
