"use client";

import { DEFAULT_PROFILE, emptySnapshot, type Backend } from "./backend";
import { DEFAULT_REMINDERS } from "./defaults";
import { TABLES, type DataSnapshot, type Profile, type TableName } from "@/lib/types";

/**
 * LOCAL DEVELOPMENT MODE — data lives only in this browser's localStorage.
 * Nothing is sent to a server. Clearing site data erases it.
 * Delete rules mirror the foreign keys in supabase/migrations so behaviour matches.
 */
const PREFIX = "gbt:v1:";
const LOCAL_USER = "00000000-0000-4000-8000-000000000001";

type Rule = { table: TableName; column: string; action: "cascade" | "set_null" };

/** child rules keyed by parent table — kept in sync with the SQL schema */
const FK_RULES: Partial<Record<TableName, Rule[]>> = {
  chapters: [
    { table: "topics", column: "chapter_id", action: "cascade" },
    { table: "study_sessions", column: "chapter_id", action: "set_null" },
    { table: "study_tasks", column: "chapter_id", action: "set_null" },
  ],
  topics: [
    { table: "check_in_topics", column: "topic_id", action: "cascade" },
    { table: "study_sessions", column: "topic_id", action: "set_null" },
    { table: "study_tasks", column: "topic_id", action: "set_null" },
    { table: "revision_records", column: "topic_id", action: "cascade" },
    { table: "interview_questions", column: "topic_id", action: "set_null" },
  ],
  check_ins: [
    { table: "check_in_topics", column: "check_in_id", action: "cascade" },
    { table: "study_sessions", column: "check_in_id", action: "cascade" },
  ],
  interview_questions: [{ table: "question_attempts", column: "question_id", action: "cascade" }],
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
}

type Row = Record<string, unknown> & { id: string };

export function createLocalBackend(): Backend {
  const rows = (t: TableName) => read<Row[]>(t, []);
  const save = (t: TableName, r: Row[]) => write(t, r);

  function deleteCascade(table: TableName, ids: Set<string>) {
    if (ids.size === 0) return;
    save(table, rows(table).filter((r) => !ids.has(r.id)));
    for (const rule of FK_RULES[table] ?? []) {
      const childRows = rows(rule.table);
      if (rule.action === "cascade") {
        const childIds = new Set(childRows.filter((r) => ids.has(r[rule.column] as string)).map((r) => r.id));
        deleteCascade(rule.table, childIds);
      } else {
        save(
          rule.table,
          childRows.map((r) => (ids.has(r[rule.column] as string) ? { ...r, [rule.column]: null } : r)),
        );
      }
    }
  }

  const backend: Backend = {
    mode: "local",
    userId: LOCAL_USER,
    userEmail: null,

    async loadAll() {
      let profile = read<Profile | null>("profile", null);
      if (!profile) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        profile = { ...DEFAULT_PROFILE, id: LOCAL_USER, display_name: null, timezone: tz };
        write("profile", profile);
      }
      const data: DataSnapshot = emptySnapshot();
      for (const t of TABLES) (data as Record<TableName, unknown[]>)[t] = rows(t);
      if (data.reminders.length === 0) {
        data.reminders = await backend.insert("reminders", DEFAULT_REMINDERS);
      }
      return { profile, data };
    },

    async insert(table, newRows) {
      const now = new Date().toISOString();
      const created = newRows.map((r) => ({ ...r, id: r.id ?? uuid(), user_id: LOCAL_USER, created_at: now })) as Row[];
      save(table, [...rows(table), ...created]);
      return created as never;
    },

    async update(table, id, patch) {
      const all = rows(table);
      const idx = all.findIndex((r) => r.id === id);
      if (idx === -1) throw new Error(`Row not found in ${table}`);
      const next = { ...all[idx], ...patch, id, user_id: LOCAL_USER } as Row;
      all[idx] = next;
      save(table, all);
      return next as never;
    },

    async remove(table, ids) {
      deleteCascade(table, new Set(ids));
    },

    async updateProfile(patch) {
      const current = read<Profile>("profile", { ...DEFAULT_PROFILE, id: LOCAL_USER });
      const next = { ...current, ...patch, id: LOCAL_USER };
      write("profile", next);
      return next;
    },

    async signOut() {
      /* no auth in local mode */
    },
  };
  return backend;
}

/** Replace all local data (used by "Restore backup" in local mode). */
export function restoreLocalSnapshot(profile: Profile | null, data: Partial<DataSnapshot>) {
  for (const t of TABLES) write(t, (data[t] ?? []).map((r) => ({ ...r, user_id: LOCAL_USER })));
  if (profile) write("profile", { ...profile, id: LOCAL_USER });
}

export function clearLocalData() {
  for (const t of TABLES) window.localStorage.removeItem(PREFIX + t);
  window.localStorage.removeItem(PREFIX + "profile");
}
