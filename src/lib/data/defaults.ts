import type { NewRow } from "@/lib/types";

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const DEFAULT_REMINDERS: NewRow<"reminders">[] = [
  { type: "daily_checkin", enabled: true, time_of_day: "21:00", days_of_week: ALL_DAYS, browser_notification: false, lead_days: 2 },
  { type: "unfinished_target", enabled: true, time_of_day: "19:00", days_of_week: ALL_DAYS, browser_notification: false, lead_days: 2 },
  { type: "deadline", enabled: true, time_of_day: "09:00", days_of_week: ALL_DAYS, browser_notification: false, lead_days: 2 },
  { type: "weekly_review", enabled: true, time_of_day: "18:00", days_of_week: [0], browser_notification: false, lead_days: 2 },
  { type: "revision_due", enabled: true, time_of_day: "08:00", days_of_week: ALL_DAYS, browser_notification: false, lead_days: 2 },
];
