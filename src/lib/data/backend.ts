import type { DataSnapshot, NewRow, Profile, TableMap, TableName } from "@/lib/types";
import type { DataMode } from "@/lib/env";

/**
 * Storage abstraction. The UI talks only to this interface, so the same
 * screens work against Supabase (persistent, per-user, RLS-protected) or the
 * browser-only local mode.
 */
export interface Backend {
  mode: DataMode;
  userId: string;
  userEmail: string | null;
  loadAll(): Promise<{ profile: Profile; data: DataSnapshot }>;
  insert<T extends TableName>(table: T, rows: NewRow<T>[]): Promise<TableMap[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<TableMap[T]>): Promise<TableMap[T]>;
  remove(table: TableName, ids: string[]): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;
  signOut(): Promise<void>;
}

export const DEFAULT_PROFILE: Omit<Profile, "id"> = {
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

export function emptySnapshot(): DataSnapshot {
  return {
    chapters: [],
    topics: [],
    check_ins: [],
    check_in_topics: [],
    study_sessions: [],
    study_tasks: [],
    daily_targets: [],
    weekly_goals: [],
    revision_records: [],
    interview_questions: [],
    question_attempts: [],
    reminders: [],
  };
}
