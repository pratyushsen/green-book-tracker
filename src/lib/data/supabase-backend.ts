"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_PROFILE, emptySnapshot, type Backend } from "./backend";
import { TABLES, type DataSnapshot, type Profile, type TableName } from "@/lib/types";
import { DEFAULT_REMINDERS } from "./defaults";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/** Supabase-backed storage. Every query is scoped by RLS to the signed-in user. */
export async function createSupabaseBackend(): Promise<Backend | null> {
  const sb: SupabaseClient = getSupabaseBrowserClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const userId = user.id;

  async function ensureProfile(): Promise<Profile> {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) fail("Loading profile", error);
    if (data) return data as Profile;
    // Fallback if the signup trigger was not installed.
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
      const results = await Promise.all(
        TABLES.map((t) => sb.from(t).select("*").eq("user_id", userId).limit(10000)),
      );
      results.forEach((res, i) => {
        if (res.error) fail(`Loading ${TABLES[i]}`, res.error);
        (data as Record<TableName, unknown[]>)[TABLES[i]] = res.data ?? [];
      });
      if (data.reminders.length === 0) {
        const { data: rem, error } = await sb
          .from("reminders")
          .insert(DEFAULT_REMINDERS.map((r) => ({ ...r, user_id: userId })))
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
      if (error) fail(`Saving to ${table}`, error);
      return data as never;
    },

    async update(table, id, patch) {
      const clean = { ...patch } as Record<string, unknown>;
      delete clean.id;
      delete clean.user_id;
      delete clean.created_at;
      const { data, error } = await sb.from(table).update(clean).eq("id", id).select().single();
      if (error) fail(`Updating ${table}`, error);
      return data as never;
    },

    async remove(table, ids) {
      if (ids.length === 0) return;
      const { error } = await sb.from(table).delete().in("id", ids);
      if (error) fail(`Deleting from ${table}`, error);
    },

    async updateProfile(patch) {
      const clean = { ...patch } as Record<string, unknown>;
      delete clean.id;
      const { data, error } = await sb.from("profiles").update(clean).eq("id", userId).select().single();
      if (error) fail("Updating settings", error);
      return data as Profile;
    },

    async signOut() {
      await sb.auth.signOut();
    },
  };
  return backend;
}
