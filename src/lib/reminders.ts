import type { DataSnapshot, DateStr, Profile, Reminder, ReminderType } from "@/lib/types";
import { dailyTargetFor, minutesByDate, revisionBuckets } from "@/lib/metrics";
import { diffDays, minutesLabel } from "@/lib/dates";

export const REMINDER_META: Record<ReminderType, { title: string; description: string; href: string }> = {
  daily_checkin: {
    title: "Daily check-in",
    description: "Nudge me if today's check-in hasn't been recorded.",
    href: "/check-ins",
  },
  unfinished_target: {
    title: "Unfinished daily target",
    description: "Warn me if today's study time is below my daily target.",
    href: "/planner",
  },
  deadline: {
    title: "Upcoming deadlines",
    description: "Tasks with a deadline within the lead window (or overdue).",
    href: "/planner",
  },
  weekly_review: {
    title: "Weekly progress review",
    description: "Prompt a weekly review on the selected day(s).",
    href: "/analytics",
  },
  revision_due: {
    title: "Topics due for revision",
    description: "Revision-list topics not revisited within your revision interval.",
    href: "/revision",
  },
};

export interface Alert {
  type: ReminderType;
  title: string;
  body: string;
  href: string;
}

/** Condition check for one reminder type, independent of the time of day. */
export function evaluate(type: ReminderType, data: DataSnapshot, profile: Profile, today: DateStr, leadDays = 2): Alert | null {
  const meta = REMINDER_META[type];
  switch (type) {
    case "daily_checkin": {
      if (data.check_ins.some((c) => c.date === today)) return null;
      return { type, title: meta.title, body: "You haven't logged today's check-in yet.", href: meta.href };
    }
    case "unfinished_target": {
      const target = dailyTargetFor(data, profile, today).minutes;
      const done = minutesByDate(data).get(today) ?? 0;
      if (target <= 0 || done >= target) return null;
      return {
        type,
        title: meta.title,
        body: `${minutesLabel(target - done)} left to hit today's ${minutesLabel(target)} target.`,
        href: meta.href,
      };
    }
    case "deadline": {
      const open = data.study_tasks.filter(
        (t) => t.deadline && t.status !== "done" && t.status !== "skipped" && diffDays(t.deadline, today) <= leadDays,
      );
      if (!open.length) return null;
      const overdue = open.filter((t) => diffDays(t.deadline!, today) < 0).length;
      const names = open
        .slice(0, 3)
        .map((t) => t.title)
        .join(", ");
      return {
        type,
        title: meta.title,
        body: `${open.length} task${open.length > 1 ? "s" : ""} due soon${overdue ? ` (${overdue} overdue)` : ""}: ${names}${open.length > 3 ? "…" : ""}`,
        href: meta.href,
      };
    }
    case "weekly_review":
      return { type, title: meta.title, body: "Time to review this week's progress and set next week's goals.", href: meta.href };
    case "revision_due": {
      const due = revisionBuckets(data, profile, today).due;
      if (!due.length) return null;
      return {
        type,
        title: meta.title,
        body: `${due.length} topic${due.length > 1 ? "s are" : " is"} due for revision.`,
        href: meta.href,
      };
    }
  }
}

/** Alerts shown in the in-app bell right now (enabled reminders whose time has passed today). */
export function currentAlerts(
  reminders: Reminder[],
  data: DataSnapshot,
  profile: Profile,
  today: DateStr,
  clock: { hhmm: string; weekday: number },
): Alert[] {
  const out: Alert[] = [];
  for (const r of reminders) {
    if (!r.enabled || !r.days_of_week.includes(clock.weekday)) continue;
    if (clock.hhmm < r.time_of_day) continue;
    const a = evaluate(r.type, data, profile, today, r.lead_days);
    if (a) out.push(a);
  }
  return out;
}
