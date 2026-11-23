import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DateStr } from "@/lib/types";

/**
 * Dates are stored as plain yyyy-MM-dd strings representing a calendar day in the
 * user's configured timezone. Arithmetic is done on "naive" local Date objects
 * built from those strings, which is safe because we never mix in clock time.
 */
export function todayIn(tz: string): DateStr {
  try {
    return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
  } catch {
    return format(new Date(), "yyyy-MM-dd");
  }
}

/** Current HH:mm and weekday (0=Sun) in the given timezone. */
export function clockIn(tz: string): { hhmm: string; weekday: number } {
  try {
    return {
      hhmm: formatInTimeZone(new Date(), tz, "HH:mm"),
      weekday: Number(formatInTimeZone(new Date(), tz, "i")) % 7,
    };
  } catch {
    const d = new Date();
    return { hhmm: format(d, "HH:mm"), weekday: d.getDay() };
  }
}

export const toDate = (d: DateStr) => parseISO(d);
export const toStr = (d: Date): DateStr => format(d, "yyyy-MM-dd");
export const shift = (d: DateStr, days: number): DateStr => toStr(addDays(toDate(d), days));
export const diffDays = (later: DateStr, earlier: DateStr) => differenceInCalendarDays(toDate(later), toDate(earlier));

export function weekStartOf(d: DateStr, weekStartsOn: number): DateStr {
  return toStr(startOfWeek(toDate(d), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 }));
}

export function weekDays(start: DateStr): DateStr[] {
  return Array.from({ length: 7 }, (_, i) => shift(start, i));
}

export function rangeDays(from: DateStr, to: DateStr): DateStr[] {
  const n = diffDays(to, from);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => shift(from, i));
}

export function fmt(d: DateStr | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "—";
  try {
    return format(toDate(d), pattern);
  } catch {
    return d;
  }
}

export function relativeDay(d: DateStr, today: DateStr): string {
  const n = diffDays(d, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days ago`;
  if (n < 7) return `In ${n} days`;
  return fmt(d, "d MMM");
}

export function minutesLabel(min: number): string {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const hours = (min: number) => Math.round((min / 60) * 10) / 10;
