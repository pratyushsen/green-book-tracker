"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_PROFILE, emptySnapshot, type Backend } from "./backend";
import { TABLES, type DataSnapshot, type Profile, type TableName } from "@/lib/types";
import { DEFAULT_REMINDERS } from "./defaults";

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };

/** Turns Postgres/PostgREST errors into messages a user can act on. */
export function describeDbError(context: string, error: PgError | null): string {
  const msg = error?.message ?? "unknown error";
  if (error?.code === "42P01" || error?.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(msg))
    return `${context}: the database tables are missing. Run the SQL in supabase/migrations (see README → Supabase setup).`;
  if (/permission denied for (table|function|schema|sequence)/i.test(msg))
    return `${context}: the database hasn't granted this app access (${msg}). Run supabase/migrations/20261124100000_data_api_grants.sql in the Supabase SQL Editor (README → Supabase setup).`;
  if (/row-level security/i.test(msg))
    return `${context}: blocked by Row Level Security — you can only change your own records. Try signing out and back in.`;
  if (error?.code === "42501") return `${context}: permission denied (${msg}).`;
  if (error?.code === "23505") return `${context}: an entry like this already exists.`;
  if (error?.code === "23514") return `${context}: a value is out of the allowed range (${msg}).`;
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg))
    return `${context}: can't reach Supabase. Check your internet connection and NEXT_PUBLIC_SUPABASE_URL.`;
  if (/JWT|session/i.test(msg)) return `${context}: your session has expired. Please sign in again.`;
  return `${context}: ${msg}`;
}

function fail(context: string, error: PgError | null): never {
  throw new Error(describeDbError(context, error));
}

/** PostgREST returns at most 1000 rows per request by default, so page through everything. */
const PAGE = 1000;
async function selectAllRows(sb: SupabaseClient, table: TableName, userId: string): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) fail(`Loading ${table.replace(/_/g, " ")}`, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Supabase-backed storage. Every query is additionally scoped by RLS to the signed-in user. */
export async function createSupabaseBackend(): Promise<Backend | null> {
  const sb: SupabaseClient = getSupabaseBrowserClient();
  const {
    data: { user },
    error: userError,
  } = await sb.auth.getUser();
  if (userError && !/session/i.test(userError.message)) fail("Checking your session", userError);
  if (!user) return null;
  const userId = user.id;

  async function ensureProfile(): Promise<Profile> {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) fail("Loading profile", error);
    if (data) return data as Profile;
    // Fallback if the signup trigger was not installed when this account was created.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const { data: created, error: insErr } = await sb
      .from("profiles")
      .insert({ ...DEFAULT_PROFILE, id: userId, timezone: tz })
      .select()
      .single();
    if (insErr) fail("Creating profile", insErr);
    return created as Profile;
  }

  const backend: Backend = {
    mode: "supabase",
    userId,
    userEmail: user.email ?? null,

    async loadAll() {
      const profile = await ensureProfile();
      const data: DataSnapshot = emptySnapshot();
      const results = await Promise.all(TABLES.map((t) => selectAllRows(sb, t, userId)));
      results.forEach((rows, i) => {
        (data as Record<TableName, unknown[]>)[TABLES[i]] = rows;
      });
      if (data.reminders.length === 0) {
        const { data: rem, error } = await sb
          .from("reminders")
          .upsert(
            DEFAULT_REMINDERS.map((r) => ({ ...r, user_id: userId })),
            { onConflict: "user_id,type", ignoreDuplicates: true },
          )
          .select();
        if (!error && rem) data.reminders = rem;
      }
      return { profile, data };
    },

    async insert(table, rows) {
      if (rows.length === 0) return [];
      const { data, error } = await sb
        .from(table)
        .insert(rows.map((r) => ({ ...r, user_id: userId })))
        .select();
      if (error) fail(`Saving ${table.replace(/_/g, " ")}`, error);
      return data as never;
    },

    async update(table, id, patch) {
      const clean = { ...patch } as Record<string, unknown>;
      delete clean.id;
      delete clean.user_id;
      delete clean.created_at;
      delete clean.updated_at;
      const { data, error } = await sb.from(table).update(clean).eq("id", id).select().maybeSingle();
      if (error) fail(`Updating ${table.replace(/_/g, " ")}`, error);
      if (!data) throw new Error(`Updating ${table.replace(/_/g, " ")}: the record no longer exists. Refresh and try again.`);
      return data as never;
    },

    async remove(table, ids) {
      if (ids.length === 0) return;
      // Chunk large deletes to keep the request URL short.
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb.from(table).delete().in("id", ids.slice(i, i + 200));
        if (error) fail(`Deleting ${table.replace(/_/g, " ")}`, error);
      }
    },

    async updateProfile(patch) {
      const clean = { ...patch } as Record<string, unknown>;
      delete clean.id;
      delete clean.created_at;
      delete clean.updated_at;
      const { data, error } = await sb.from("profiles").update(clean).eq("id", userId).select().single();
      if (error) fail("Updating settings", error);
      return data as Profile;
    },

    async signOut() {
      const { error } = await sb.auth.signOut();
      if (error) fail("Signing out", error);
    },
  };
  return backend;
}
