"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  BellRing,
  CheckCircle2,
  CircleSlash,
  Database,
  Download,
  HardDrive,
  LogOut,
  MonitorSmartphone,
  Moon,
  Save,
  Send,
  Sun,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Profile, Reminder } from "@/lib/types";
import { TABLES } from "@/lib/types";
import { REMINDER_META } from "@/lib/reminders";
import { clockIn, fmt } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  notificationSupport,
  requestNotificationPermission,
  showBrowserNotification,
  type PermissionState,
} from "@/lib/notifications";
import { clearLocalData, restoreLocalSnapshot } from "@/lib/data/local-backend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, EnumSelect, Field, PageHeader, intOr } from "@/components/shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useTimezones() {
  return useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "Asia/Singapore", "Asia/Hong_Kong"];
    }
  }, []);
}

function ProfileCard() {
  const { profile, updateProfile, today } = useStore();
  const timezones = useTimezones();
  const [form, setForm] = useState({
    display_name: "",
    timezone: "UTC",
    week_starts_on: "1",
    daily: "120",
    weeklyHours: "12",
    topics: "5",
    interval: "14",
    stale: "21",
    target: "",
  });
  useEffect(() => {
    setForm({
      display_name: profile.display_name ?? "",
      timezone: profile.timezone,
      week_starts_on: String(profile.week_starts_on),
      daily: String(profile.daily_target_minutes),
      weeklyHours: String(Math.round((profile.weekly_target_minutes / 60) * 10) / 10),
      topics: String(profile.weekly_topic_goal),
      interval: String(profile.revision_interval_days),
      stale: String(profile.stale_after_days),
      target: profile.target_completion_date ?? "",
    });
  }, [profile]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const patch: Partial<Profile> = {
      display_name: form.display_name.trim() || null,
      timezone: form.timezone,
      week_starts_on: Number(form.week_starts_on),
      daily_target_minutes: clamp(intOr(form.daily, 120), 0, 1440),
      weekly_target_minutes: clamp(Math.round(parseFloat(form.weeklyHours || "0") * 60), 0, 10080),
      weekly_topic_goal: clamp(intOr(form.topics, 5), 0, 500),
      revision_interval_days: clamp(intOr(form.interval, 14), 1, 365),
      stale_after_days: clamp(intOr(form.stale, 21), 1, 365),
      target_completion_date: form.target || null,
    };
    await updateProfile(patch);
    toast.success("Settings saved");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile & study targets</CardTitle>
        <CardDescription>Targets drive the dashboard, planner and reminder checks.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="st-name">
              <Input id="st-name" value={form.display_name} onChange={set("display_name")} />
            </Field>
            <Field label="Target date to finish the book" htmlFor="st-target" hint="Optional — shows whether you're on pace.">
              <Input id="st-target" type="date" min={today} value={form.target} onChange={set("target")} />
            </Field>
            <Field
              label="Timezone"
              hint={
                <>
                  Used for &quot;today&quot;, streaks and reminder times. Your browser reports <b>{browserTz}</b>.{" "}
                  {form.timezone !== browserTz && (
                    <button type="button" className="cursor-pointer text-primary underline-offset-2 hover:underline" onClick={() => setForm((f) => ({ ...f, timezone: browserTz }))}>
                      Use it
                    </button>
                  )}
                </>
              }
            >
              <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(timezones.includes(form.timezone) ? timezones : [form.timezone, ...timezones]).map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Week starts on">
              <EnumSelect
                value={form.week_starts_on}
                onChange={(v) => setForm((f) => ({ ...f, week_starts_on: v }))}
                options={[
                  { value: "1", label: "Monday" },
                  { value: "0", label: "Sunday" },
                  { value: "6", label: "Saturday" },
                ]}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Daily target (minutes)" htmlFor="st-daily">
              <Input id="st-daily" type="number" min={0} max={1440} step={5} value={form.daily} onChange={set("daily")} />
            </Field>
            <Field label="Weekly target (hours)" htmlFor="st-weekly">
              <Input id="st-weekly" type="number" min={0} step={0.5} value={form.weeklyHours} onChange={set("weeklyHours")} />
            </Field>
            <Field label="Weekly topic goal" htmlFor="st-topics">
              <Input id="st-topics" type="number" min={0} value={form.topics} onChange={set("topics")} />
            </Field>
            <Field label="Revision interval (days)" htmlFor="st-int" hint="Revision-list topics come due after this.">
              <Input id="st-int" type="number" min={1} max={365} value={form.interval} onChange={set("interval")} />
            </Field>
            <Field label="Flag as stale after (days)" htmlFor="st-stale">
              <Input id="st-stale" type="number" min={1} max={365} value={form.stale} onChange={set("stale")} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit">
              <Save /> Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Tier({ ok, title, children }: { ok: "yes" | "partial" | "no"; title: string; children: React.ReactNode }) {
  const Icon = ok === "yes" ? CheckCircle2 : ok === "partial" ? MonitorSmartphone : CircleSlash;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className={cn("size-4", ok === "yes" ? "text-primary" : ok === "partial" ? "text-sky-400" : "text-muted-foreground")} />
        {title}
        <Badge variant={ok === "yes" ? "success" : ok === "partial" ? "info" : "outline"} className="ml-auto">
          {ok === "yes" ? "Active" : ok === "partial" ? "While app is open" : "Not configured"}
        </Badge>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function ReminderRow({ r }: { r: Reminder }) {
  const { update } = useStore();
  const meta = REMINDER_META[r.type];
  const [time, setTime] = useState(r.time_of_day);
  useEffect(() => setTime(r.time_of_day), [r.time_of_day]);
  const toggleDay = (d: number) => {
    const days = r.days_of_week.includes(d) ? r.days_of_week.filter((x) => x !== d) : [...r.days_of_week, d].sort();
    if (!days.length) return toast.error("Pick at least one day");
    void update("reminders", r.id, { days_of_week: days });
  };
  return (
    <div className={cn("grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto]", !r.enabled && "opacity-60")}>
      <div className="flex items-start gap-3">
        <Switch checked={r.enabled} onCheckedChange={(v) => void update("reminders", r.id, { enabled: v })} aria-label={`Enable ${meta.title}`} className="mt-0.5" />
        <div>
          <div className="text-sm font-medium">{meta.title}</div>
          <div className="text-xs text-muted-foreground">{meta.description}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pl-12 lg:pl-0">
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => time && time !== r.time_of_day && void update("reminders", r.id, { time_of_day: time })}
          className="h-8 w-28"
          aria-label={`${meta.title} time`}
        />
        <div className="flex gap-0.5" role="group" aria-label="Days">
          {WEEKDAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(i)}
              aria-pressed={r.days_of_week.includes(i)}
              className={cn(
                "h-7 w-8 cursor-pointer rounded text-[11px] transition-colors",
                r.days_of_week.includes(i) ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {d.slice(0, 2)}
            </button>
          ))}
        </div>
        {r.type === "deadline" && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            within
            <Input
              type="number"
              min={0}
              max={30}
              defaultValue={r.lead_days}
              onBlur={(e) => void update("reminders", r.id, { lead_days: Math.min(30, Math.max(0, intOr(e.target.value, 2))) })}
              className="h-8 w-14"
            />
            days
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={r.browser_notification} onCheckedChange={(v) => void update("reminders", r.id, { browser_notification: v })} />
          Browser notification
        </label>
      </div>
    </div>
  );
}

function RemindersCard() {
  const { data, profile } = useStore();
  const [perm, setPerm] = useState<PermissionState>("default");
  useEffect(() => setPerm(notificationSupport()), []);
  const order = Object.keys(REMINDER_META);
  const reminders = [...data.reminders].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const clock = clockIn(profile.timezone);
  const anyBrowser = data.reminders.some((r) => r.enabled && r.browser_notification);

  return (
    <Card id="reminders" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" /> Reminders & notifications
        </CardTitle>
        <CardDescription>
          Times are in <b>{profile.timezone}</b> (currently {clock.hhmm}). Each reminder fires at most once per day, only if its condition is still true.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Tier ok="yes" title="In-app reminders">
            Shown as toasts and in the bell menu whenever the app is open in a tab and a reminder&apos;s time has passed. Missed ones appear the next time you open the app that day.
          </Tier>
          <Tier ok={perm === "granted" ? "partial" : "no"} title="Browser notifications">
            {perm === "unsupported"
              ? "This browser doesn't support the Notifications API."
              : perm === "granted"
                ? "Permission granted. System notifications are shown for reminders with “Browser notification” on — but only while a tab of this app is open (it can be in the background)."
                : perm === "denied"
                  ? "Blocked in your browser's site settings. Re-enable notifications for this site there."
                  : "Not yet permitted. Allow them to get system notifications while a tab of this app is open."}
          </Tier>
          <Tier ok="no" title="Push when app is closed">
            Not set up. Delivering reminders with every tab closed needs Web Push (VAPID keys, a push subscription stored per device and a server-side scheduler such as a Supabase cron + Edge Function). This app does not pretend to do that — see the README.
          </Tier>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={perm === "granted" ? "success" : perm === "denied" ? "danger" : "outline"}>
            {perm === "granted" ? <CheckCircle2 /> : <XCircle />} Notification permission: {perm}
          </Badge>
          {perm === "default" && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const p = await requestNotificationPermission();
                setPerm(p);
                if (p === "granted") toast.success("Browser notifications enabled");
              }}
            >
              <BellRing /> Allow browser notifications
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              toast("Test reminder", { description: "This is how an in-app reminder looks." });
              if (perm === "granted") {
                const ok = await showBrowserNotification("Green Book Tracker", "Test notification — browser notifications are working.", "/settings");
                if (!ok) toast.error("The browser refused to show a notification");
              }
            }}
          >
            <Send /> Send test
          </Button>
          {anyBrowser && perm !== "granted" && (
            <span className="text-xs text-amber-400">Some reminders want browser notifications but permission isn&apos;t granted — they will only appear in-app.</span>
          )}
        </div>

        <div className="divide-y divide-border/60 border-t border-border/60">
          {reminders.map((r) => (
            <ReminderRow key={r.id} r={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DataCard() {
  const { data, profile, mode, userEmail, signOut, reload } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const counts = TABLES.map((t) => [t, data[t].length] as const).filter(([, n]) => n > 0);

  function exportJson() {
    const blob = new Blob([JSON.stringify({ app: "green-book-tracker", version: 1, exported_at: new Date().toISOString(), profile, data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `green-book-tracker-backup-${fmt(new Date().toISOString().slice(0, 10), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file: File) {
    try {
      const json = JSON.parse(await file.text());
      if (json.app !== "green-book-tracker" || !json.data) throw new Error("Not a Green Book Tracker backup");
      restoreLocalSnapshot(json.profile ?? null, json.data);
      await reload();
      toast.success("Backup restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read backup");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data & account</CardTitle>
        <CardDescription>Where your study data lives and how to back it up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3 text-sm",
            mode === "local" ? "border-amber-500/30 bg-amber-500/5" : "border-primary/30 bg-primary/5",
          )}
        >
          {mode === "local" ? <HardDrive className="mt-0.5 size-4 text-amber-300" /> : <Database className="mt-0.5 size-4 text-primary" />}
          <div>
            <div className="font-medium">{mode === "local" ? "Local development mode" : `Supabase · ${userEmail ?? ""}`}</div>
            <p className="text-xs text-muted-foreground">
              {mode === "local"
                ? "Data is stored only in this browser's localStorage. It is not sent anywhere, not synced across devices, and is lost if you clear site data. Configure Supabase (see README) for real persistence."
                : "Your data is stored in Supabase Postgres. Row Level Security ensures only your signed-in account can read or write it."}
            </p>
          </div>
        </div>
        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([t, n]) => (
              <Badge key={t} variant="outline">
                {t.replace(/_/g, " ")}: {n}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}>
            <Download /> Export JSON backup
          </Button>
          {mode === "local" && (
            <>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent">
                <Upload className="size-4" /> Restore backup
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
              </label>
              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => setConfirmClear(true)}>
                Clear local data
              </Button>
            </>
          )}
          {mode === "supabase" && (
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut /> Sign out
            </Button>
          )}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all local data?"
        description="This permanently erases everything stored in this browser. Export a backup first if you want to keep it."
        confirmLabel="Clear data"
        onConfirm={async () => {
          clearLocalData();
          await reload();
        }}
      />
    </Card>
  );
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Dark mode is the default.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        {(["dark", "light"] as const).map((t) => (
          <Button key={t} variant={mounted && theme === t ? "default" : "outline"} size="sm" onClick={() => setTheme(t)}>
            {t === "dark" ? <Moon /> : <Sun />} {t === "dark" ? "Dark" : "Light"}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Targets, timezone, reminders and data." />
      <div className="grid gap-4">
        <ProfileCard />
        <RemindersCard />
        <div className="grid gap-4 lg:grid-cols-2">
          <DataCard />
          <AppearanceCard />
        </div>
      </div>
    </>
  );
}
