"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emptySnapshot } from "./backend";
import { describeDbError } from "./supabase-backend";
import type { DataSnapshot, Profile, TableName } from "@/lib/types";
import { TABLES } from "@/lib/types";

type Row = Record<string, unknown> & { id: string };

export interface ImportPlan {
  payload: DataSnapshot & { profile?: Partial<Profile> };
  /** rows that will be inserted per table */
  counts: Partial<Record<TableName, number>>;
  /** human-readable reasons rows were left out (they stay in local storage) */
  skipped: string[];
  total: number;
}

const newId = () => crypto.randomUUID();

/**
 * Builds an import payload from a legacy/backup snapshot:
 *  - every row gets a fresh UUID (so the same data can be imported into
 *    another account without primary-key clashes), with all references remapped;
 *  - references to rows that don't exist are cleared or the row is dropped,
 *    mirroring the ON DELETE rules in the schema;
 *  - days that already have a check-in / target / weekly goal in the cloud are skipped
 *    rather than overwritten.
 */
export function planImport(
  source: { profile: Profile | null; data: Partial<DataSnapshot> },
  cloud: DataSnapshot,
  applySettings: boolean,
): ImportPlan {
  const src = { ...emptySnapshot(), ...source.data } as unknown as Record<TableName, Row[]>;
  const out = emptySnapshot() as unknown as Record<TableName, Row[]>;
  const skipped: string[] = [];
  const maps: Partial<Record<TableName, Map<string, string>>> = {};
  const map = (t: TableName) => (maps[t] ??= new Map());
  const ref = (t: TableName, old: unknown) => (typeof old === "string" ? (map(t).get(old) ?? null) : null);
  const skip = (n: number, why: string) => n > 0 && skipped.push(`${n} ${why}`);

  const cloudIds = Object.fromEntries(TABLES.map((t) => [t, new Set((cloud[t] as unknown as Row[]).map((r) => r.id))])) as Record<
    TableName,
    Set<string>
  >;
  const existing: Partial<Record<TableName, number>> = {};

  const add = (t: TableName, r: Row, patch: Record<string, unknown> = {}) => {
    // Already in this account (e.g. a backup exported from it): link to it, don't duplicate.
    if (typeof r.id === "string" && cloudIds[t].has(r.id)) {
      map(t).set(r.id, r.id);
      existing[t] = (existing[t] ?? 0) + 1;
      return;
    }
    const id = newId();
    if (typeof r.id === "string") map(t).set(r.id, id);
    const row = { ...r, ...patch, id } as Row;
    delete row.user_id;
    delete row.updated_at;
    out[t].push(row);
  };

  for (const r of src.chapters) add("chapters", r);

  let n = 0;
  for (const r of src.topics) {
    const chapter_id = ref("chapters", r.chapter_id);
    if (!chapter_id) { n++; continue; }
    add("topics", r, { chapter_id });
  }
  skip(n, "topic(s) whose chapter no longer exists");

  const cloudDates = new Set(cloud.check_ins.map((c) => c.date));
  n = 0;
  for (const r of src.check_ins) {
    if (cloudIds.check_ins.has(r.id)) { add("check_ins", r); continue; }
    if (cloudDates.has(r.date as string)) { n++; continue; }
    cloudDates.add(r.date as string);
    add("check_ins", r);
  }
  skip(n, "daily check-in(s) for dates that already have a check-in in your account");

  n = 0;
  const seenLinks = new Set<string>();
  for (const r of src.check_in_topics) {
    const check_in_id = ref("check_ins", r.check_in_id);
    const topic_id = ref("topics", r.topic_id);
    const key = `${check_in_id}:${topic_id}`;
    if (!check_in_id || !topic_id || seenLinks.has(key)) { n++; continue; }
    seenLinks.add(key);
    add("check_in_topics", r, { check_in_id, topic_id });
  }
  skip(n, "check-in topic link(s) pointing at skipped or missing records");

  n = 0;
  let invalid = 0;
  for (const r of src.study_sessions) {
    const minutes = Number(r.minutes);
    if (!(minutes >= 1 && minutes <= 1440)) { invalid++; continue; }
    let check_in_id: string | null = null;
    if (r.check_in_id) {
      check_in_id = ref("check_ins", r.check_in_id);
      if (!check_in_id) { n++; continue; }
    }
    add("study_sessions", r, { check_in_id, topic_id: ref("topics", r.topic_id), chapter_id: ref("chapters", r.chapter_id) });
  }
  skip(n, "study session(s) belonging to skipped check-ins");
  skip(invalid, "study session(s) with an invalid duration");

  for (const r of src.study_tasks)
    add("study_tasks", r, { topic_id: ref("topics", r.topic_id), chapter_id: ref("chapters", r.chapter_id) });

  const targetDates = new Set(cloud.daily_targets.map((d) => d.date));
  n = 0;
  for (const r of src.daily_targets) {
    if (targetDates.has(r.date as string)) { n++; continue; }
    targetDates.add(r.date as string);
    add("daily_targets", r);
  }
  skip(n, "daily target(s) for dates already set in your account");

  const weeks = new Set(cloud.weekly_goals.map((w) => w.week_start));
  n = 0;
  for (const r of src.weekly_goals) {
    if (weeks.has(r.week_start as string)) { n++; continue; }
    weeks.add(r.week_start as string);
    add("weekly_goals", r);
  }
  skip(n, "weekly goal(s) for weeks already set in your account");

  n = 0;
  for (const r of src.revision_records) {
    const topic_id = ref("topics", r.topic_id);
    if (!topic_id) { n++; continue; }
    add("revision_records", r, { topic_id });
  }
  skip(n, "revision record(s) whose topic no longer exists");

  for (const r of src.interview_questions) add("interview_questions", r, { topic_id: ref("topics", r.topic_id) });

  n = 0;
  for (const r of src.question_attempts) {
    const question_id = ref("interview_questions", r.question_id);
    if (!question_id) { n++; continue; }
    add("question_attempts", r, { question_id });
  }
  skip(n, "question attempt(s) whose question no longer exists");

  const dupes = Object.values(existing).reduce((a, b) => a + (b ?? 0), 0);
  skip(dupes, "record(s) already in your account (not duplicated)");

  // Reminders are per-type settings (one row each); they're applied, not inserted.
  out.reminders = applySettings ? src.reminders.map((r) => ({ ...r })) : [];

  const counts: Partial<Record<TableName, number>> = {};
  let total = 0;
  for (const t of TABLES) {
    if (t === "reminders") continue;
    if (out[t].length) counts[t] = out[t].length;
    total += out[t].length;
  }
  const payload = out as unknown as ImportPlan["payload"];
  if (applySettings && source.profile) {
    const { id: _id, created_at: _c, updated_at: _u, ...settings } = source.profile as Profile & { updated_at?: string };
    void _id; void _c; void _u;
    payload.profile = settings;
  }
  return { payload, counts, skipped, total };
}

export interface ImportResult {
  alreadyImported: boolean;
  rowCounts: Record<string, number>;
}

/** Sends the whole payload to the database in a single transaction. */
export async function runImport(
  sb: SupabaseClient,
  plan: ImportPlan,
  fingerprint: string,
  source: "local_storage" | "backup_file",
  applySettings: boolean,
): Promise<ImportResult> {
  const { data, error } = await sb.rpc("import_local_snapshot", {
    p_fingerprint: fingerprint,
    p_source: source,
    p_data: plan.payload,
    p_apply_settings: applySettings,
  });
  if (error) {
    if (error.code === "PGRST202" || /import_local_snapshot/.test(error.message) && /not find|does not exist/i.test(error.message))
      throw new Error(
        "Import isn't set up in the database yet. Run supabase/migrations/20261124000000_local_data_import.sql (see README).",
      );
    throw new Error(describeDbError("Importing your data", error));
  }
  const res = data as { already_imported: boolean; row_counts: Record<string, number> | null };
  return { alreadyImported: res.already_imported, rowCounts: res.row_counts ?? {} };
}

/** Reads every imported id back from Supabase and confirms it is there. */
export async function verifyImport(sb: SupabaseClient, plan: ImportPlan): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  for (const t of TABLES) {
    if (t === "reminders") continue;
    const ids = (plan.payload[t] as unknown as Row[]).map((r) => r.id);
    let found = 0;
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const { count, error } = await sb.from(t).select("id", { count: "exact", head: true }).in("id", chunk);
      if (error) {
        problems.push(describeDbError(`Verifying ${t.replace(/_/g, " ")}`, error));
        break;
      }
      found += count ?? 0;
    }
    if (found !== ids.length) problems.push(`${t.replace(/_/g, " ")}: expected ${ids.length}, found ${found}`);
  }
  return { ok: problems.length === 0, problems };
}
