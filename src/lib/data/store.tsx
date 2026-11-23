"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Backend } from "./backend";
import { emptySnapshot } from "./backend";
import { createLocalBackend } from "./local-backend";
import { createSupabaseBackend } from "./supabase-backend";
import { DATA_MODE, type DataMode } from "@/lib/env";
import { todayIn } from "@/lib/dates";
import type {
  Activity,
  CheckIn,
  DataSnapshot,
  DateStr,
  NewRow,
  Profile,
  StudyTask,
  TableMap,
  TableName,
  Topic,
  TopicStatus,
} from "@/lib/types";

export interface CheckInInput {
  date: DateStr;
  studied: boolean;
  minutes: number;
  problems_solved: number;
  learned: string;
  difficulties: string;
  tomorrow_focus: string;
  topicIds: string[];
  activity: Activity;
}

interface StoreValue {
  status: "loading" | "ready" | "error" | "signed_out";
  error: string | null;
  mode: DataMode;
  userEmail: string | null;
  profile: Profile;
  data: DataSnapshot;
  today: DateStr;
  reload(): Promise<void>;
  create<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<TableMap[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T] | null>;
  remove(table: TableName, ids: string[]): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  setTopicStatus(topic: Topic, status: TopicStatus): Promise<void>;
  saveCheckIn(input: CheckInInput): Promise<CheckIn | null>;
  logRevision(topic: Topic, date: DateStr, confidence: number | null, notes: string): Promise<void>;
  rescheduleTask(task: StudyTask, date: DateStr): Promise<void>;
  signOut(): Promise<void>;
}

const PLACEHOLDER_PROFILE: Profile = {
  id: "",
  display_name: null,
  timezone: "UTC",
  daily_target_minutes: 120,
  weekly_target_minutes: 720,
  weekly_topic_goal: 5,
  revision_interval_days: 14,
  stale_after_days: 21,
  week_starts_on: 1,
  target_completion_date: null,
};

const StoreContext = createContext<StoreValue | null>(null);

function report(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  toast.error(msg);
  return msg;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const backendRef = useRef<Backend | null>(null);
  const [status, setStatus] = useState<StoreValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(PLACEHOLDER_PROFILE);
  const [data, setData] = useState<DataSnapshot>(emptySnapshot);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [today, setToday] = useState<DateStr>(() => todayIn("UTC"));

  const load = useCallback(async () => {
    try {
      if (!backendRef.current) {
        backendRef.current = DATA_MODE === "supabase" ? await createSupabaseBackend() : createLocalBackend();
      }
      const backend = backendRef.current;
      if (!backend) {
        setStatus("signed_out");
        return;
      }
      setUserEmail(backend.userEmail);
      const res = await backend.loadAll();
      setProfile(res.profile);
      setData(res.data);
      setToday(todayIn(res.profile.timezone));
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep "today" correct across midnight in the user's timezone.
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayIn(profile.timezone)), 30_000);
    setToday(todayIn(profile.timezone));
    return () => window.clearInterval(id);
  }, [profile.timezone]);

  const backend = () => {
    if (!backendRef.current) throw new Error("Data store not ready");
    return backendRef.current;
  };

  const create = useCallback(async <T extends TableName>(table: T, rows: NewRow<T>[]) => {
    try {
      const created = await backend().insert(table, rows);
      setData((d) => ({ ...d, [table]: [...d[table], ...created] }));
      return created;
    } catch (e) {
      report(e);
      return [];
    }
  }, []);

  const update = useCallback(async <T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>) => {
    try {
      const row = await backend().update(table, id, patch);
      setData((d) => ({
        ...d,
        [table]: (d[table] as TableMap[T][]).map((r) => (r.id === id ? row : r)),
      }));
      return row;
    } catch (e) {
      report(e);
      return null;
    }
  }, []);

  const remove = useCallback(
    async (table: TableName, ids: string[]) => {
      try {
        await backend().remove(table, ids);
        // Deletions can cascade (e.g. chapter -> topics), so resync everything.
        const res = await backend().loadAll();
        setData(res.data);
      } catch (e) {
        report(e);
      }
    },
    [],
  );

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    try {
      const p = await backend().updateProfile(patch);
      setProfile(p);
    } catch (e) {
      report(e);
    }
  }, []);

  const value = useMemo<StoreValue>(() => {
    const setTopicStatus: StoreValue["setTopicStatus"] = async (topic, next) => {
      const patch: Partial<Topic> = { status: next };
      if (next === "completed") {
        patch.completed_on = topic.completed_on ?? today;
        patch.last_studied_on = today;
      } else {
        patch.completed_on = null;
        if (next === "in_progress") patch.last_studied_on = topic.last_studied_on ?? today;
      }
      await update("topics", topic.id, patch);
    };

    const saveCheckIn: StoreValue["saveCheckIn"] = async (input) => {
      const fields = {
        date: input.date,
        studied: input.studied,
        minutes: input.studied ? input.minutes : 0,
        problems_solved: input.studied ? input.problems_solved : 0,
        learned: input.learned || null,
        difficulties: input.difficulties || null,
        tomorrow_focus: input.tomorrow_focus || null,
      };
      try {
        const b = backend();
        const existing = data.check_ins.find((c) => c.date === input.date);
        const checkIn = existing
          ? await b.update("check_ins", existing.id, fields)
          : (await b.insert("check_ins", [fields]))[0];

        // Sync topics studied (join table)
        const oldLinks = data.check_in_topics.filter((l) => l.check_in_id === checkIn.id);
        const wanted = new Set(input.studied ? input.topicIds : []);
        const toRemove = oldLinks.filter((l) => !wanted.has(l.topic_id)).map((l) => l.id);
        const have = new Set(oldLinks.map((l) => l.topic_id));
        const toAdd = [...wanted].filter((id) => !have.has(id));
        await b.remove("check_in_topics", toRemove);
        await b.insert(
          "check_in_topics",
          toAdd.map((topic_id) => ({ check_in_id: checkIn.id, topic_id })),
        );

        // Sync the linked study session (study time lives in study_sessions)
        const linked = data.study_sessions.find((s) => s.check_in_id === checkIn.id);
        const firstTopic = input.topicIds[0] ?? null;
        const chapterId = firstTopic ? (data.topics.find((t) => t.id === firstTopic)?.chapter_id ?? null) : null;
        if (fields.minutes > 0) {
          const sess = {
            date: input.date,
            minutes: fields.minutes,
            activity: input.activity,
            problems_solved: fields.problems_solved,
            topic_id: input.topicIds.length === 1 ? firstTopic : null,
            chapter_id: chapterId,
            check_in_id: checkIn.id,
            notes: "From daily check-in",
          };
          if (linked) await b.update("study_sessions", linked.id, sess);
          else await b.insert("study_sessions", [sess]);
        } else if (linked) {
          await b.remove("study_sessions", [linked.id]);
        }

        // Topics studied: record last-studied date, and move Not Started -> In Progress
        for (const id of wanted) {
          const t = data.topics.find((x) => x.id === id);
          if (!t) continue;
          const patch: Partial<Topic> = {};
          if (!t.last_studied_on || t.last_studied_on < input.date) patch.last_studied_on = input.date;
          if (t.status === "not_started") patch.status = "in_progress";
          if (Object.keys(patch).length) await b.update("topics", t.id, patch);
        }

        const res = await b.loadAll();
        setData(res.data);
        return checkIn;
      } catch (e) {
        report(e);
        return null;
      }
    };

    const logRevision: StoreValue["logRevision"] = async (topic, date, confidence, notes) => {
      const rec = await create("revision_records", [
        { topic_id: topic.id, revised_on: date, confidence_after: confidence, notes: notes || null },
      ]);
      if (!rec.length) return;
      const patch: Partial<Topic> = {};
      if (confidence) patch.confidence = confidence;
      if (!topic.last_studied_on || topic.last_studied_on < date) patch.last_studied_on = date;
      if (Object.keys(patch).length) await update("topics", topic.id, patch);
    };

    const rescheduleTask: StoreValue["rescheduleTask"] = async (task, date) => {
      await update("study_tasks", task.id, {
        scheduled_date: date,
        rescheduled_count: task.rescheduled_count + 1,
        status: task.status === "skipped" ? "todo" : task.status,
      });
    };

    return {
      status,
      error,
      mode: DATA_MODE,
      userEmail,
      profile,
      data,
      today,
      reload: load,
      create,
      update,
      remove,
      updateProfile,
      setTopicStatus,
      saveCheckIn,
      logRevision,
      rescheduleTask,
      signOut: async () => {
        await backendRef.current?.signOut();
        window.location.href = "/login";
      },
    };
  }, [status, error, userEmail, profile, data, today, load, create, update, remove, updateProfile]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <DataProvider>");
  return ctx;
}
