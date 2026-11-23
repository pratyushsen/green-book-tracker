export type TopicStatus = "not_started" | "in_progress" | "completed";
export type Difficulty = "easy" | "medium" | "hard";
export type Activity = "reading" | "problems" | "revision" | "interview_prep" | "other";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type ReminderType =
  | "daily_checkin"
  | "unfinished_target"
  | "deadline"
  | "weekly_review"
  | "revision_due";

/** ISO date string, yyyy-MM-dd, interpreted in the user's timezone. */
export type DateStr = string;

interface Owned {
  id: string;
  user_id: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  daily_target_minutes: number;
  weekly_target_minutes: number;
  weekly_topic_goal: number;
  revision_interval_days: number;
  stale_after_days: number;
  week_starts_on: number;
  target_completion_date: DateStr | null;
  created_at?: string;
  updated_at?: string;
}

export interface Chapter extends Owned {
  number: string | null;
  title: string;
  description: string | null;
  position: number;
  created_at?: string;
}

export interface Topic extends Owned {
  chapter_id: string;
  title: string;
  position: number;
  status: TopicStatus;
  difficulty: Difficulty | null;
  confidence: number | null;
  completed_on: DateStr | null;
  last_studied_on: DateStr | null;
  notes: string | null;
  formulas: string | null;
  in_revision_list: boolean;
  created_at?: string;
}

export interface CheckIn extends Owned {
  date: DateStr;
  studied: boolean;
  minutes: number;
  problems_solved: number;
  learned: string | null;
  difficulties: string | null;
  tomorrow_focus: string | null;
  created_at?: string;
}

export interface CheckInTopic extends Owned {
  check_in_id: string;
  topic_id: string;
}

export interface StudySession extends Owned {
  date: DateStr;
  minutes: number;
  activity: Activity;
  problems_solved: number;
  topic_id: string | null;
  chapter_id: string | null;
  check_in_id: string | null;
  notes: string | null;
  created_at?: string;
}

export interface StudyTask extends Owned {
  title: string;
  description: string | null;
  topic_id: string | null;
  chapter_id: string | null;
  scheduled_date: DateStr | null;
  deadline: DateStr | null;
  priority: Priority;
  status: TaskStatus;
  planned_minutes: number;
  rescheduled_count: number;
  completed_at: string | null;
  created_at?: string;
}

export interface DailyTarget extends Owned {
  date: DateStr;
  target_minutes: number;
  target_problems: number;
}

export interface WeeklyGoal extends Owned {
  week_start: DateStr;
  target_minutes: number;
  target_topics: number;
  notes: string | null;
}

export interface RevisionRecord extends Owned {
  topic_id: string;
  revised_on: DateStr;
  confidence_after: number | null;
  notes: string | null;
  created_at?: string;
}

export interface InterviewQuestion extends Owned {
  title: string;
  body: string | null;
  category: string | null;
  difficulty: Difficulty | null;
  source: string | null;
  solution: string | null;
  tags: string[];
  topic_id: string | null;
  starred: boolean;
  created_at?: string;
}

export interface QuestionAttempt extends Owned {
  question_id: string;
  attempted_on: DateStr;
  correct: boolean;
  time_spent_minutes: number | null;
  mistake: string | null;
  lesson: string | null;
  created_at?: string;
}

export interface Reminder extends Owned {
  type: ReminderType;
  enabled: boolean;
  time_of_day: string;
  days_of_week: number[];
  browser_notification: boolean;
  lead_days: number;
}

/** Map of table name -> row type for every user-owned table. */
export interface TableMap {
  chapters: Chapter;
  topics: Topic;
  check_ins: CheckIn;
  check_in_topics: CheckInTopic;
  study_sessions: StudySession;
  study_tasks: StudyTask;
  daily_targets: DailyTarget;
  weekly_goals: WeeklyGoal;
  revision_records: RevisionRecord;
  interview_questions: InterviewQuestion;
  question_attempts: QuestionAttempt;
  reminders: Reminder;
}

export type TableName = keyof TableMap;

export const TABLES: TableName[] = [
  "chapters",
  "topics",
  "check_ins",
  "check_in_topics",
  "study_sessions",
  "study_tasks",
  "daily_targets",
  "weekly_goals",
  "revision_records",
  "interview_questions",
  "question_attempts",
  "reminders",
];

/** Insert payload: everything except id/user_id/timestamps, which the backend fills. */
export type NewRow<T extends TableName> = Omit<TableMap[T], "id" | "user_id" | "created_at"> & {
  id?: string;
};

export type DataSnapshot = { [K in TableName]: TableMap[K][] };
