/**
 * Supabase connection settings (public values only).
 *
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is the new-style browser key (sb_publishable_…).
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is accepted as a fallback for projects that still use
 * the legacy anon JWT key. Both are safe to ship to the browser: every table is
 * protected by Row Level Security.
 *
 * The secret / service-role key must NEVER be given a NEXT_PUBLIC_ prefix or be
 * imported anywhere in this app. Nothing here needs it.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const SUPABASE_CONFIG_ERROR =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the dev server.";

/** All study data is stored in Supabase. (localStorage is only read once, to import legacy data.) */
export type DataMode = "supabase";
export const DATA_MODE: DataMode = "supabase";
