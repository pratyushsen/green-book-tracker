"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/data/store";
import { clockIn } from "@/lib/dates";
import { evaluate } from "@/lib/reminders";
import { registerServiceWorker, showBrowserNotification, notificationSupport } from "@/lib/notifications";

const FIRED_PREFIX = "gbt:fired:";

/**
 * In-app reminder scheduler. Runs only while the app is open in a tab.
 * Every 30s it checks each enabled reminder: if today's configured time has passed
 * (in the user's timezone), the condition holds, and it hasn't fired yet today,
 * it shows an in-app toast and — if enabled and permitted — a browser notification.
 */
export function ReminderEngine() {
  const { data, profile, today, status } = useStore();
  const router = useRouter();
  const latest = useRef({ data, profile, today });
  latest.current = { data, profile, today };

  useEffect(() => {
    if (notificationSupport() === "granted") void registerServiceWorker();
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    const tick = () => {
      const { data, profile, today } = latest.current;
      const clock = clockIn(profile.timezone);
      for (const r of data.reminders) {
        if (!r.enabled || !r.days_of_week.includes(clock.weekday) || clock.hhmm < r.time_of_day) continue;
        const key = `${FIRED_PREFIX}${r.type}:${today}`;
        try {
          if (window.localStorage.getItem(key)) continue;
        } catch {
          /* ignore */
        }
        const alert = evaluate(r.type, data, profile, today, r.lead_days);
        if (!alert) continue;
        try {
          window.localStorage.setItem(key, "1");
        } catch {
          /* ignore */
        }
        toast(alert.title, {
          description: alert.body,
          duration: 12_000,
          action: { label: "Open", onClick: () => router.push(alert.href) },
        });
        if (r.browser_notification) void showBrowserNotification(alert.title, alert.body, alert.href);
      }
    };
    const first = window.setTimeout(tick, 2500);
    const id = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [status, router]);

  return null;
}
