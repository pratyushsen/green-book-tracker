/**
 * Supabase is enabled only when both public env vars are present.
 * Otherwise the app runs in "local mode": data is kept in this browser's
 * localStorage and is NOT persisted to any server.
 *
 * Only the anon (publishable) key is ever used in the browser. The service-role
 * key must never be given a NEXT_PUBLIC_ prefix or imported into client code.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type DataMode = "supabase" | "local";
export const DATA_MODE: DataMode = isSupabaseConfigured ? "supabase" : "local";
