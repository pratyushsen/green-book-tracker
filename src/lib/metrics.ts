import type {
  Activity,
  Chapter,
  DataSnapshot,
  DateStr,
  InterviewQuestion,
  Profile,
  QuestionAttempt,
  Topic,
} from "@/lib/types";
import { diffDays, rangeDays, shift, weekDays, weekStartOf } from "@/lib/dates";

export interface ChapterStat {
  chapter: Chapter;
  topics: Topic[];
  total: number;
  completed: number;
  inProgress: number;
  pct: number;
  minutes: number;
}

export function sortChapters(chapters: Chapter[]) {
  return [...chapters].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
}
export function sortTopics(topics: Topic[]) {
  return [...topics].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
}

export function bookProgress(data: DataSnapshot) {
  const topics = data.topics;
  const total = topics.length;
  const completed = topics.filter((t) => t.status === "completed").length;
  const inProgress = topics.filter((t) => t.status === "in_progress").length;
  const notStarted = total - completed - inProgress;
  const minutesByChapter = new Map<string, number>();
  const topicChapter = new Map(topics.map((t) => [t.id, t.chapter_id]));
  for (const s of data.study_sessions) {
    const ch = s.chapter_id ?? (s.topic_id ? topicChapter.get(s.topic_id) : undefined);
    if (ch) minutesByChapter.set(ch, (minutesByChapter.get(ch) ?? 0) + s.minutes);
  }
  const chapters: ChapterStat[] = sortChapters(data.chapters).map((chapter) => {
    const ts = sortTopics(topics.filter((t) => t.chapter_id === chapter.id));
    const c = ts.filter((t) => t.status === "completed").length;
    return {
      chapter,
      topics: ts,
      total: ts.length,
      completed: c,
      inProgress: ts.filter((t) => t.status === "in_progress").length,
      pct: ts.length ? (c / ts.length) * 100 : 0,
      minutes: minutesByChapter.get(chapter.id) ?? 0,
    };
  });
  const chaptersCompleted = chapters.filter((c) => c.total > 0 && c.completed === c.total).length;
  return {
    total,
    completed,
    inProgress,
    notStarted,
    pct: total ? (completed / total) * 100 : 0,
    chapters,
    chaptersCompleted,
    totalChapters: data.chapters.length,
  };
}

export function minutesByDate(data: DataSnapshot): Map<DateStr, number> {
  const m = new Map<DateStr, number>();
  for (const s of data.study_sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.minutes);
  return m;
}

export function problemsByDate(data: DataSnapshot): Map<DateStr, number> {
  const m = new Map<DateStr, number>();
  for (const s of data.study_sessions) m.set(s.date, (m.get(s.date) ?? 0) + (s.problems_solved || 0));
  return m;
}

export function studyDaySet(data: DataSnapshot): Set<DateStr> {
  const set = new Set<DateStr>();
  for (const s of data.study_sessions) if (s.minutes > 0) set.add(s.date);
  for (const c of data.check_ins) if (c.studied) set.add(c.date);
  return set;
}

export function streaks(data: DataSnapshot, today: DateStr) {
  const days = studyDaySet(data);
  let current = 0;
  let cursor = days.has(today) ? today : shift(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = shift(cursor, -1);
  }
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: DateStr | null = null;
  for (const d of sorted) {
    run = prev && diffDays(d, prev) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, studiedToday: days.has(today), totalDays: days.size };
}

export function dailyTargetFor(data: DataSnapshot, profile: Profile, date: DateStr) {
  const o = data.daily_targets.find((t) => t.date === date);
  return { minutes: o?.target_minutes ?? profile.daily_target_minutes, problems: o?.target_problems ?? 0, override: o ?? null };
}

export function weeklyGoalFor(data: DataSnapshot, profile: Profile, weekStart: DateStr) {
  const g = data.weekly_goals.find((w) => w.week_start === weekStart);
  return {
    minutes: g?.target_minutes ?? profile.weekly_target_minutes,
    topics: g?.target_topics ?? profile.weekly_topic_goal,
    goal: g ?? null,
  };
}

export function weekSummary(data: DataSnapshot, profile: Profile, today: DateStr, offsetWeeks = 0) {
  const start = shift(weekStartOf(today, profile.week_starts_on), offsetWeeks * 7);
  const days = weekDays(start);
  const end = days[6];
  const mins = minutesByDate(data);
  const minutes = days.reduce((a, d) => a + (mins.get(d) ?? 0), 0);
  const topicsCompleted = data.topics.filter(
    (t) => t.completed_on && t.completed_on >= start && t.completed_on <= end,
  ).length;
  const goal = weeklyGoalFor(data, profile, start);
  return { start, end, days, minutes, topicsCompleted, goal };
}

export function projection(data: DataSnapshot, today: DateStr) {
  const total = data.topics.length;
  const done = data.topics.filter((t) => t.status === "completed").length;
  const remaining = total - done;
  const windowStart = shift(today, -27);
  const recent = data.topics.filter((t) => t.completed_on && t.completed_on >= windowStart && t.completed_on <= today).length;
  const perDay = recent / 28;
  if (remaining === 0 && total > 0) return { remaining, perWeek: perDay * 7, eta: today, done: true };
  if (perDay === 0) return { remaining, perWeek: 0, eta: null as DateStr | null, done: false };
  return { remaining, perWeek: perDay * 7, eta: shift(today, Math.ceil(remaining / perDay)), done: false };
}

export function revisionCounts(data: DataSnapshot) {
  const m = new Map<string, number>();
  for (const r of data.revision_records) m.set(r.topic_id, (m.get(r.topic_id) ?? 0) + 1);
  return m;
}

/** Most recent day the topic was touched: studied, completed or revised. */
export function lastTouched(data: DataSnapshot): Map<string, DateStr | null> {
  const m = new Map<string, DateStr | null>();
  for (const t of data.topics) {
    const cands = [t.last_studied_on, t.completed_on].filter(Boolean) as DateStr[];
    m.set(t.id, cands.sort().at(-1) ?? null);
  }
  for (const r of data.revision_records) {
    const cur = m.get(r.topic_id);
    if (!cur || r.revised_on > cur) m.set(r.topic_id, r.revised_on);
  }
  return m;
}

export function revisionBuckets(data: DataSnapshot, profile: Profile, today: DateStr) {
  const touched = lastTouched(data);
  const since = (t: Topic) => {
    const d = touched.get(t.id);
    return d ? diffDays(today, d) : null;
  };
  const revisionList = data.topics.filter((t) => t.in_revision_list);
  const due = revisionList.filter((t) => {
    const s = since(t);
    return s === null || s >= profile.revision_interval_days;
  });
  const lowConfidence = data.topics.filter((t) => t.confidence !== null && t.confidence <= 2);
  const stale = data.topics.filter((t) => {
    if (t.status === "not_started") return false;
    const s = since(t);
    return s === null || s >= profile.stale_after_days;
  });
  const withFormulas = data.topics.filter((t) => (t.formulas ?? "").trim() || (t.notes ?? "").trim());
  return { revisionList, due, lowConfidence, stale, withFormulas, touched, since };
}

export interface QuestionStat {
  question: InterviewQuestion;
  attempts: QuestionAttempt[];
  latest: QuestionAttempt | null;
  solved: boolean;
}

export function questionStats(data: DataSnapshot) {
  const byQ = new Map<string, QuestionAttempt[]>();
  for (const a of data.question_attempts) {
    const arr = byQ.get(a.question_id) ?? [];
    arr.push(a);
    byQ.set(a.question_id, arr);
  }
  const stats: QuestionStat[] = data.interview_questions.map((q) => {
    const attempts = (byQ.get(q.id) ?? []).sort((a, b) =>
      (b.attempted_on + (b.created_at ?? "")).localeCompare(a.attempted_on + (a.created_at ?? "")),
    );
    return { question: q, attempts, latest: attempts[0] ?? null, solved: attempts.some((a) => a.correct) };
  });
  const attempted = stats.filter((s) => s.attempts.length > 0).length;
  const solved = stats.filter((s) => s.solved).length;
  const totalAttempts = data.question_attempts.length;
  const correctAttempts = data.question_attempts.filter((a) => a.correct).length;
  return {
    stats,
    total: stats.length,
    attempted,
    solved,
    totalAttempts,
    correctAttempts,
    accuracy: totalAttempts ? (correctAttempts / totalAttempts) * 100 : 0,
  };
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  reading: "Reading",
  problems: "Problem solving",
  revision: "Revision",
  interview_prep: "Interview prep",
  other: "Other",
};

export function activityDistribution(data: DataSnapshot, from?: DateStr) {
  const m = new Map<Activity, number>();
  for (const s of data.study_sessions) {
    if (from && s.date < from) continue;
    m.set(s.activity, (m.get(s.activity) ?? 0) + s.minutes);
  }
  return (Object.keys(ACTIVITY_LABELS) as Activity[])
    .map((a) => ({ key: a, name: ACTIVITY_LABELS[a], value: m.get(a) ?? 0 }))
    .filter((d) => d.value > 0);
}

export function dailySeries(data: DataSnapshot, profile: Profile, from: DateStr, to: DateStr) {
  const mins = minutesByDate(data);
  const probs = problemsByDate(data);
  return rangeDays(from, to).map((d) => ({
    date: d,
    minutes: mins.get(d) ?? 0,
    problems: probs.get(d) ?? 0,
    target: dailyTargetFor(data, profile, d).minutes,
  }));
}
