"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Plus,
  Search,
  Target,
  Trash2,
  Puzzle,
} from "lucide-react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Activity, CheckIn } from "@/lib/types";
import { ACTIVITY_LABELS, dailyTargetFor, minutesByDate, sortChapters, sortTopics, streaks } from "@/lib/metrics";
import { fmt, minutesLabel, rangeDays, toDate, toStr, weekStartOf, shift } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog, EmptyState, EnumSelect, Field, PageHeader, StatCard, chapterLabel, intOr } from "@/components/shared";
import { ACTIVITY_OPTIONS, SessionDialog } from "@/components/session-dialog";

function TopicChecklist({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const set = new Set(selected);
  const chapters = sortChapters(data.chapters);
  if (!data.topics.length)
    return <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Add topics in My Book to link them here.</p>;
  return (
    <div className="rounded-md border border-input">
      <div className="relative border-b border-border">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter topics…"
          className="h-8 w-full bg-transparent pr-2 pl-8 text-xs outline-none"
          aria-label="Filter topics"
        />
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {chapters.map((c) => {
          const topics = sortTopics(data.topics.filter((t) => t.chapter_id === c.id)).filter(
            (t) => !q || t.title.toLowerCase().includes(q.toLowerCase()),
          );
          if (!topics.length) return null;
          return (
            <div key={c.id} className="py-1">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{chapterLabel(c)}</div>
              {topics.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/60">
                  <Checkbox
                    checked={set.has(t.id)}
                    onCheckedChange={(v) => onChange(v ? [...selected, t.id] : selected.filter((x) => x !== t.id))}
                  />
                  <span className="truncate">{t.title}</span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
      {selected.length > 0 && <div className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">{selected.length} selected</div>}
    </div>
  );
}

function CheckInForm({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const { data, today, saveCheckIn, remove } = useStore();
  const existing = data.check_ins.find((c) => c.date === date) ?? null;
  const linkedSession = existing ? data.study_sessions.find((s) => s.check_in_id === existing.id) : null;
  const otherMinutes = data.study_sessions.filter((s) => s.date === date && (!existing || s.check_in_id !== existing.id)).reduce((a, s) => a + s.minutes, 0);

  const [studied, setStudied] = useState(true);
  const [minutes, setMinutes] = useState("60");
  const [problems, setProblems] = useState("0");
  const [activity, setActivity] = useState<Activity>("reading");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [learned, setLearned] = useState("");
  const [difficulties, setDifficulties] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setStudied(existing?.studied ?? true);
    setMinutes(String(existing?.minutes ?? 60));
    setProblems(String(existing?.problems_solved ?? 0));
    setActivity(linkedSession?.activity ?? "reading");
    setTopicIds(existing ? data.check_in_topics.filter((l) => l.check_in_id === existing.id).map((l) => l.topic_id) : []);
    setLearned(existing?.learned ?? "");
    setDifficulties(existing?.difficulties ?? "");
    setTomorrow(existing?.tomorrow_focus ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.id]);

  // Yesterday's "focus for tomorrow" is shown as a prompt
  const yesterday = data.check_ins.find((c) => c.date === shift(date, -1));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = intOr(minutes);
    if (studied && (m < 0 || m > 1440)) return toast.error("Minutes must be between 0 and 1440");
    setBusy(true);
    const res = await saveCheckIn({
      date,
      studied,
      minutes: m,
      problems_solved: Math.max(0, intOr(problems)),
      activity,
      topicIds,
      learned: learned.trim(),
      difficulties: difficulties.trim(),
      tomorrow_focus: tomorrow.trim(),
    });
    setBusy(false);
    if (res) toast.success(existing ? "Check-in updated" : "Check-in saved");
  }

  return (
    <Card className="fade-up">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {date === today ? "Today's check-in" : `Check-in for ${fmt(date, "EEE d MMM")}`}
            {existing ? <Badge variant="success">Saved</Badge> : <Badge variant="outline">Not recorded</Badge>}
          </CardTitle>
          <CardDescription>Your check-in time feeds study totals, streaks and targets.</CardDescription>
        </div>
        <Input type="date" value={date} max={today} onChange={(e) => e.target.value && onDateChange(e.target.value)} className="w-40" aria-label="Check-in date" />
      </CardHeader>
      <CardContent>
        {yesterday?.tomorrow_focus && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
            <span className="font-medium text-primary">Planned focus from the day before: </span>
            <span className="text-muted-foreground">{yesterday.tomorrow_focus}</span>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Did you study?">
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setStudied(v)}
                  className={cn(
                    "cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors",
                    studied === v ? "border-primary/60 bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:bg-accent",
                  )}
                  aria-pressed={studied === v}
                >
                  {v ? "Yes, I studied" : "No study today"}
                </button>
              ))}
            </div>
          </Field>

          {studied && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Minutes studied" htmlFor="ci-min">
                  <Input id="ci-min" type="number" min={0} max={1440} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </Field>
                <Field label="Problems solved" htmlFor="ci-prob">
                  <Input id="ci-prob" type="number" min={0} value={problems} onChange={(e) => setProblems(e.target.value)} />
                </Field>
                <Field label="Main activity" className="col-span-2 sm:col-span-1">
                  <EnumSelect value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} />
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {otherMinutes > 0
                    ? `Plus ${minutesLabel(otherMinutes)} from separately logged sessions on this day.`
                    : "Studied in several blocks? Log extra sessions separately."}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSessionOpen(true)}>
                  <Plus /> Log extra session
                </Button>
              </div>
              <Field label="Topics studied" hint="Not-started topics you tick are moved to In progress.">
                <TopicChecklist selected={topicIds} onChange={setTopicIds} />
              </Field>
            </>
          )}

          <Field label="What did you learn?" htmlFor="ci-learned">
            <Textarea id="ci-learned" rows={3} value={learned} onChange={(e) => setLearned(e.target.value)} placeholder="Key insights, techniques, formulas…" />
          </Field>
          <Field label="Difficulties encountered" htmlFor="ci-diff">
            <Textarea id="ci-diff" rows={2} value={difficulties} onChange={(e) => setDifficulties(e.target.value)} placeholder="Where did you get stuck?" />
          </Field>
          <Field label="Focus for tomorrow" htmlFor="ci-tom">
            <Textarea id="ci-tom" rows={2} value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} placeholder="What should you tackle next?" />
          </Field>
          <div className="flex items-center justify-between">
            {existing ? (
              <Button type="button" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={busy}>
              <CalendarCheck2 /> {existing ? "Update check-in" : "Save check-in"}
            </Button>
          </div>
        </form>
      </CardContent>
      <SessionDialog open={sessionOpen} onOpenChange={setSessionOpen} defaultDate={date} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this check-in?"
        description="The study time recorded with it is removed too. Separately logged sessions are kept."
        onConfirm={async () => {
          if (existing) await remove("check_ins", [existing.id]);
        }}
      />
    </Card>
  );
}

function ActivityCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const { data, profile, today } = useStore();
  const [month, setMonth] = useState(() => startOfMonth(toDate(today)));
  const mins = useMemo(() => minutesByDate(data), [data]);
  const checkins = useMemo(() => new Map(data.check_ins.map((c) => [c.date, c])), [data.check_ins]);
  const first = toStr(startOfMonth(month));
  const last = toStr(endOfMonth(month));
  const gridStart = weekStartOf(first, profile.week_starts_on);
  const days = rangeDays(gridStart, shift(weekStartOf(last, profile.week_starts_on), 6));
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => fmt(shift(gridStart, i), "EEEEE"));
  const monthMinutes = rangeDays(first, last).reduce((a, d) => a + (mins.get(d) ?? 0), 0);
  const monthDays = rangeDays(first, last).filter((d) => (mins.get(d) ?? 0) > 0 || checkins.get(d)?.studied).length;

  const level = (d: string) => {
    const m = mins.get(d) ?? 0;
    const target = dailyTargetFor(data, profile, d).minutes || 60;
    if (m <= 0) return 0;
    const r = m / target;
    return r < 0.34 ? 1 : r < 0.67 ? 2 : r < 1 ? 3 : 4;
  };
  const LEVEL_BG = ["", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"];

  return (
    <Card className="fade-up">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{format(month, "MMMM yyyy")}</CardTitle>
          <CardDescription>
            {monthDays} study days · {minutesLabel(monthMinutes)}
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
          {weekdayLabels.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const inMonth = d >= first && d <= last;
            const future = d > today;
            const ci = checkins.get(d);
            const lv = level(d);
            return (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <button
                    disabled={future}
                    onClick={() => onSelect(d)}
                    className={cn(
                      "relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border text-xs transition-all",
                      !inMonth && "opacity-30",
                      future ? "cursor-default border-transparent text-muted-foreground/40" : "border-border/60 hover:border-primary/50",
                      lv > 0 ? LEVEL_BG[lv] : "bg-muted/30",
                      lv >= 3 && "text-primary-foreground",
                      d === selected && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                      d === today && "font-bold",
                    )}
                  >
                    <span className="tabular">{Number(d.slice(8))}</span>
                    {ci && <span className={cn("absolute bottom-1 size-1 rounded-full", lv >= 3 ? "bg-primary-foreground" : "bg-primary")} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="font-medium">{fmt(d, "EEE d MMM")}</div>
                  <div className="text-muted-foreground">
                    {minutesLabel(mins.get(d) ?? 0)} studied · {ci ? (ci.studied ? "checked in" : "checked in (rest day)") : "no check-in"}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" /> check-in recorded
          </span>
          <span className="flex items-center gap-1">
            Less
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={cn("size-3 rounded-[3px] border border-border/60", l ? LEVEL_BG[l] : "bg-muted/30")} />
            ))}
            More (vs. daily target)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryLog({ onSelect }: { onSelect: (d: string) => void }) {
  const { data, remove } = useStore();
  const [q, setQ] = useState("");
  const topicName = useMemo(() => new Map(data.topics.map((t) => [t.id, t.title])), [data.topics]);
  const checkIns = [...data.check_ins]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((c) => !q || [c.learned, c.difficulties, c.tomorrow_focus].some((x) => (x ?? "").toLowerCase().includes(q.toLowerCase())));
  const sessions = [...data.study_sessions].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const topicsFor = (c: CheckIn) => data.check_in_topics.filter((l) => l.check_in_id === c.id).map((l) => topicName.get(l.topic_id) ?? "");

  return (
    <Card className="fade-up">
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Every check-in and study session you&apos;ve recorded</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="checkins">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList>
              <TabsTrigger value="checkins">Check-ins ({data.check_ins.length})</TabsTrigger>
              <TabsTrigger value="sessions">Sessions ({data.study_sessions.length})</TabsTrigger>
            </TabsList>
            <div className="relative sm:w-64">
              <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="h-8 pl-8 text-xs" />
            </div>
          </div>
          <TabsContent value="checkins">
            {checkIns.length === 0 ? (
              <EmptyState icon={CalendarCheck2} title="No check-ins yet" description="Record today's check-in above to start your log." />
            ) : (
              <ul className="space-y-2">
                {checkIns.map((c) => {
                  const topics = topicsFor(c);
                  return (
                    <li key={c.id}>
                      <button onClick={() => onSelect(c.date)} className="w-full cursor-pointer rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-sm font-medium">{fmt(c.date, "EEE d MMM yyyy")}</span>
                          {c.studied ? (
                            <>
                              <Badge variant="default">{minutesLabel(c.minutes)}</Badge>
                              {c.problems_solved > 0 && <Badge variant="info">{c.problems_solved} problems</Badge>}
                            </>
                          ) : (
                            <Badge variant="outline">Rest day</Badge>
                          )}
                          {topics.slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="max-w-40 truncate">
                              {t}
                            </Badge>
                          ))}
                          {topics.length > 3 && <span className="text-[11px] text-muted-foreground">+{topics.length - 3}</span>}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                          {c.learned && (
                            <p className="line-clamp-2">
                              <span className="text-foreground/80">Learned: </span>
                              {c.learned}
                            </p>
                          )}
                          {c.difficulties && (
                            <p className="line-clamp-2">
                              <span className="text-foreground/80">Difficulties: </span>
                              {c.difficulties}
                            </p>
                          )}
                          {c.tomorrow_focus && (
                            <p className="line-clamp-2">
                              <span className="text-foreground/80">Next: </span>
                              {c.tomorrow_focus}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="sessions">
            {sessions.length === 0 ? (
              <EmptyState icon={Clock} title="No study sessions yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Activity</th>
                      <th className="py-2 pr-3 font-medium">Topic</th>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td className="tabular py-2 pr-3 whitespace-nowrap">{fmt(s.date, "d MMM yy")}</td>
                        <td className="tabular py-2 pr-3">{minutesLabel(s.minutes)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{ACTIVITY_LABELS[s.activity]}</td>
                        <td className="max-w-48 truncate py-2 pr-3 text-muted-foreground">{s.topic_id ? topicName.get(s.topic_id) : "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge variant={s.check_in_id ? "secondary" : "outline"}>{s.check_in_id ? "Check-in" : "Session"}</Badge>
                        </td>
                        <td className="py-2 text-right">
                          {!s.check_in_id && (
                            <Button variant="ghost" size="icon-sm" aria-label="Delete session" onClick={() => void remove("study_sessions", [s.id])}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function CheckInsPage() {
  const { data, today, profile } = useStore();
  const [date, setDate] = useState(today);
  const streak = streaks(data, today);
  const mins = minutesByDate(data);
  const last30 = rangeDays(shift(today, -29), today);
  const studied30 = last30.filter((d) => (mins.get(d) ?? 0) > 0).length;
  const problems = data.study_sessions.reduce((a, s) => a + s.problems_solved, 0);
  const hitTarget = last30.filter((d) => (mins.get(d) ?? 0) >= dailyTargetFor(data, profile, d).minutes && (mins.get(d) ?? 0) > 0).length;

  return (
    <>
      <PageHeader title="Daily Check-ins" description="Record what you studied each day and build your streak." />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Current streak" value={`${streak.current}d`} sub={`Longest ${streak.longest}d`} icon={Flame} accent={streak.current > 0} />
        <StatCard label="Study days (30d)" value={`${studied30}/30`} icon={CalendarCheck2} />
        <StatCard label="Target hit (30d)" value={`${hitTarget} days`} icon={Target} />
        <StatCard label="Problems solved" value={problems} sub="all time" icon={Puzzle} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <CheckInForm date={date} onDateChange={setDate} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <ActivityCalendar selected={date} onSelect={setDate} />
        </div>
      </div>
      <div className="mt-4">
        <HistoryLog
          onSelect={(d) => {
            setDate(d);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </>
  );
}
