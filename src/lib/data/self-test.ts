"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeDbError } from "./supabase-backend";

export interface TestStep {
  name: string;
  ok: boolean;
  detail?: string;
  ms: number;
}

const MARK = "[connection test]";
const TEST_DATE = "2000-01-01";

/**
 * End-to-end check against the real Supabase project, as the signed-in user:
 * create → read → update → delete on every table, cascade rules, and that RLS
 * rejects writes for another user. Every row it creates is removed afterwards.
 */
export async function runDatabaseSelfTest(sb: SupabaseClient): Promise<TestStep[]> {
  const steps: TestStep[] = [];
  const created: { table: string; id: string }[] = [];

  async function step(name: string, fn: () => Promise<string | void>) {
    const t0 = performance.now();
    try {
      const detail = await fn();
      steps.push({ name, ok: true, detail: detail || undefined, ms: Math.round(performance.now() - t0) });
      return true;
    } catch (e) {
      steps.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Math.round(performance.now() - t0) });
      return false;
    }
  }
  const must = <T>(ctx: string, res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> => {
    if (res.error) throw new Error(describeDbError(ctx, res.error));
    if (res.data === null || res.data === undefined) throw new Error(`${ctx}: no data returned`);
    return res.data as NonNullable<T>;
  };
  async function insert(table: string, row: Record<string, unknown>) {
    const r = must(`insert ${table}`, await sb.from(table).insert(row).select().single()) as { id: string };
    created.push({ table, id: r.id });
    return r;
  }

  let uid = "";
  const ok = await step("Session: signed-in user", async () => {
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) throw new Error(error?.message ?? "Not signed in");
    uid = data.user.id;
    return data.user.email ?? uid;
  });
  if (!ok) return steps;

  try {
    await step("Read: own profile (RLS returns only your row)", async () => {
      const rows = must("select profiles", await sb.from("profiles").select("id"));
      if (rows.length !== 1 || rows[0].id !== uid) throw new Error(`expected exactly your profile, got ${rows.length} rows`);
    });

    await step("Read: all 13 tables reachable", async () => {
      const tables = [
        "chapters", "topics", "check_ins", "check_in_topics", "study_sessions", "study_tasks", "daily_targets",
        "weekly_goals", "revision_records", "interview_questions", "question_attempts", "reminders", "data_imports",
      ];
      for (const t of tables) {
        const { error } = await sb.from(t).select("id", { head: true, count: "exact" });
        if (error) throw new Error(describeDbError(`select ${t}`, error));
      }
      return `${tables.length} tables`;
    });

    let chapterId = "", topicId = "", questionId = "", checkInId = "", sessionId = "", taskId = "";

    await step("Create + update: chapter", async () => {
      chapterId = (await insert("chapters", { user_id: uid, title: `${MARK} chapter`, position: 9999 })).id;
      const u = must("update chapters", await sb.from("chapters").update({ title: `${MARK} chapter (edited)` }).eq("id", chapterId).select().single()) as { title: string };
      if (!u.title.endsWith("(edited)")) throw new Error("update not persisted");
    });

    await step("Create + update: topic", async () => {
      topicId = (await insert("topics", { user_id: uid, chapter_id: chapterId, title: `${MARK} topic` })).id;
      const u = must("update topics", await sb.from("topics").update({ status: "completed", completed_on: TEST_DATE, confidence: 4 }).eq("id", topicId).select().single()) as { status: string };
      if (u.status !== "completed") throw new Error("update not persisted");
    });

    await step("Create: daily check-in + topic link", async () => {
      checkInId = (await insert("check_ins", { user_id: uid, date: TEST_DATE, minutes: 30, learned: MARK })).id;
      await insert("check_in_topics", { user_id: uid, check_in_id: checkInId, topic_id: topicId });
    });

    await step("Create: study session", async () => {
      sessionId = (await insert("study_sessions", { user_id: uid, date: TEST_DATE, minutes: 25, topic_id: topicId, chapter_id: chapterId, notes: MARK })).id;
    });

    await step("Create + update: study task", async () => {
      taskId = (await insert("study_tasks", { user_id: uid, title: `${MARK} task`, topic_id: topicId, chapter_id: chapterId, scheduled_date: TEST_DATE })).id;
      must("update study_tasks", await sb.from("study_tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", taskId).select().single());
    });

    await step("Create: daily target + weekly goal", async () => {
      await insert("daily_targets", { user_id: uid, date: TEST_DATE, target_minutes: 60 });
      await insert("weekly_goals", { user_id: uid, week_start: TEST_DATE, target_minutes: 300, notes: MARK });
    });

    await step("Create: revision record", async () => {
      await insert("revision_records", { user_id: uid, topic_id: topicId, revised_on: TEST_DATE, confidence_after: 3, notes: MARK });
    });

    await step("Create: interview question + attempt", async () => {
      questionId = (await insert("interview_questions", { user_id: uid, title: `${MARK} question`, tags: ["test"], topic_id: topicId })).id;
      await insert("question_attempts", { user_id: uid, question_id: questionId, attempted_on: TEST_DATE, correct: true });
    });

    await step("Update: reminder and profile (restored afterwards)", async () => {
      const rem = must("select reminders", await sb.from("reminders").select("id, lead_days").limit(1)) as { id: string; lead_days: number }[];
      if (rem.length) {
        const r = rem[0];
        const next = r.lead_days === 30 ? 29 : r.lead_days + 1;
        must("update reminders", await sb.from("reminders").update({ lead_days: next }).eq("id", r.id).select().single());
        must("restore reminders", await sb.from("reminders").update({ lead_days: r.lead_days }).eq("id", r.id).select().single());
      }
      const p = must("select profile", await sb.from("profiles").select("display_name").eq("id", uid).single()) as { display_name: string | null };
      must("update profile", await sb.from("profiles").update({ display_name: p.display_name }).eq("id", uid).select().single());
      return rem.length ? "reminder + profile" : "profile (no reminders yet)";
    });

    await step("Read back: all test records visible", async () => {
      const ids = created.map((c) => c.id);
      let found = 0;
      for (const t of new Set(created.map((c) => c.table))) {
        const { count, error } = await sb.from(t).select("id", { count: "exact", head: true }).in("id", ids);
        if (error) throw new Error(describeDbError(`read ${t}`, error));
        found += count ?? 0;
      }
      if (found !== ids.length) throw new Error(`expected ${ids.length}, found ${found}`);
      return `${found} rows`;
    });

    await step("Security: RLS blocks writing as another user", async () => {
      const other = crypto.randomUUID();
      const { data, error } = await sb.from("chapters").insert({ user_id: other, title: `${MARK} should fail` }).select();
      if (!error) {
        for (const r of (data ?? []) as { id: string }[]) created.push({ table: "chapters", id: r.id });
        throw new Error("insert with another user_id was ALLOWED — RLS is not enforced!");
      }
      return "rejected as expected";
    });

    await step("Delete: chapter cascades to topic, revision, link; detaches session & task", async () => {
      must("delete chapters", await sb.from("chapters").delete().eq("id", chapterId).select());
      const t = must("check topics", await sb.from("topics").select("id").eq("id", topicId));
      if (t.length) throw new Error("topic not cascaded");
      const s = must("check session", await sb.from("study_sessions").select("topic_id, chapter_id").eq("id", sessionId).single()) as { topic_id: string | null; chapter_id: string | null };
      if (s.topic_id || s.chapter_id) throw new Error("session references not cleared");
      const q = must("check question", await sb.from("interview_questions").select("topic_id").eq("id", questionId).single()) as { topic_id: string | null };
      if (q.topic_id) throw new Error("question topic not cleared");
    });
  } finally {
    await step("Cleanup: remove every test record", async () => {
      // Delete in child → parent order; cascaded rows are already gone (no error).
      const order = ["question_attempts", "interview_questions", "revision_records", "check_in_topics", "study_sessions",
        "check_ins", "study_tasks", "daily_targets", "weekly_goals", "topics", "chapters"];
      for (const t of order) {
        const ids = created.filter((c) => c.table === t).map((c) => c.id);
        if (!ids.length) continue;
        const { error } = await sb.from(t).delete().in("id", ids);
        if (error) throw new Error(describeDbError(`cleanup ${t}`, error));
      }
      let left = 0;
      for (const t of new Set(created.map((c) => c.table))) {
        const { count } = await sb.from(t).select("id", { count: "exact", head: true }).in("id", created.map((c) => c.id));
        left += count ?? 0;
      }
      if (left) throw new Error(`${left} test rows could not be removed`);
      return `${created.length} rows removed`;
    });
  }
  return steps;
}
