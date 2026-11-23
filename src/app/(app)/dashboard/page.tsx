"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  CircleDashed,
  Clock,
  Flame,
  Hourglass,
  ListTodo,
  Target,
  TrendingUp,
} from "lucide-react";
import { useStore } from "@/lib/data/store";
import {
  activityDistribution,
  bookProgress,
  dailyTargetFor,
  minutesByDate,
  projection,
  streaks,
  weekSummary,
} from "@/lib/metrics";
import { diffDays, fmt, hours, minutesLabel, relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PriorityBadge, PRIORITY_META, ProgressRing, StatCard, chapterLabel } from "@/components/shared";
import { Donut, SimpleBars } from "@/components/charts/chart-kit";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { data, profile, today } = useStore();
  const progress = useMemo(() => bookProgress(data), [data]);
  const streak = useMemo(() => streaks(data, today), [data, today]);
  const proj = useMemo(() => projection(data, today), [data, today]);
  const week = useMemo(() => weekSummary(data, profile, today), [data, profile, today]);
  const mins = useMemo(() => minutesByDate(data), [data]);
  const totalMinutes = data.study_sessions.reduce((a, s) => a + s.minutes, 0);
  const todayMinutes = mins.get(today) ?? 0;
  const dailyTarget = dailyTargetFor(data, profile, today).minutes;
  const checkedInToday = data.check_ins.some((c) => c.date === today);

  const weekData = week.days.map((d) => ({
    day: fmt(d, "EEE"),
    date: d,
    minutes: mins.get(d) ?? 0,
  }));

  const last8 = Array.from({ length: 8 }, (_, i) => weekSummary(data, profile, today, i - 7)).map((w) => ({
    week: fmt(w.start, "d MMM"),
    minutes: w.minutes,
  }));

  const activity = activityDistribution(data);
  const chapterDist = progress.chapters
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((c) => ({ name: chapterLabel(c.chapter), value: c.minutes }));

  const upcoming = data.study_tasks
    .filter((t) => t.status !== "done" && t.status !== "skipped")
    .filter((t) => {
      const d = t.scheduled_date ?? t.deadline;
      return !d || diffDays(d, today) <= 14;
    })
    .sort((a, b) => {
      const da = a.scheduled_date ?? a.deadline ?? "9999";
      const db = b.scheduled_date ?? b.deadline ?? "9999";
      return da.localeCompare(db) || PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank;
    })
    .slice(0, 6);

  // Target-date pace
  const target = profile.target_completion_date;
  const weeksLeft = target ? Math.max(diffDays(target, today) / 7, 0) : null;
  const neededPerWeek = target && weeksLeft ? proj.remaining / weeksLeft : null;
  const onTrack = neededPerWeek !== null ? proj.perWeek >= neededPerWeek : null;

  const name = profile.display_name ? `, ${profile.display_name.split(" ")[0]}` : "";

  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting()}
            {name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.total === 0
              ? "Start by adding the book's chapters and topics."
              : proj.done
                ? "You've completed every topic in the book. Time to drill interview questions."
                : `${proj.remaining} topic${proj.remaining === 1 ? "" : "s"} to go until you finish the book.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant={checkedInToday ? "outline" : "default"} size="sm">
            <Link href="/check-ins">
              <CalendarCheck2 /> {checkedInToday ? "Edit today's check-in" : "Check in for today"}
            </Link>
          </Button>
        </div>
      </div>

      {/* Hero: how close am I */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="card-glow fade-up lg:col-span-2">
          <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row">
            <ProgressRing value={progress.pct} size={150} stroke={11}>
              <span className="tabular text-3xl font-semibold tracking-tight">{Math.round(progress.pct)}%</span>
              <span className="text-[11px] text-muted-foreground">complete</span>
            </ProgressRing>
            <div className="w-full flex-1 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Book completion</div>
                <div className="mt-1 text-lg font-semibold">
                  <span className="tabular">{progress.completed}</span>
                  <span className="text-muted-foreground"> / {progress.total} topics</span>
                  <span className="mx-2 text-muted-foreground/50">·</span>
                  <span className="tabular">{progress.chaptersCompleted}</span>
                  <span className="text-muted-foreground"> / {progress.totalChapters} chapters</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Completed", value: progress.completed, cls: "bg-primary" },
                  { label: "In progress", value: progress.inProgress, cls: "bg-amber-400/80" },
                  { label: "Not started", value: progress.notStarted, cls: "bg-muted-foreground/40" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/70 bg-background/30 px-2 py-2">
                    <div className="tabular text-lg font-semibold">{s.value}</div>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={cn("size-1.5 rounded-full", s.cls)} />
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              {progress.total > 0 && (
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="bg-primary transition-all duration-700" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
                  <div className="ml-0.5 bg-amber-400/80 transition-all duration-700" style={{ width: `${(progress.inProgress / progress.total) * 100}%` }} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-primary" />
                  Pace: <span className="tabular text-foreground">{proj.perWeek.toFixed(1)}</span> topics/week (last 4 weeks)
                </span>
                {!proj.done && progress.total > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Hourglass className="size-3.5 text-primary" />
                    {proj.eta ? (
                      <>
                        Projected finish: <span className="text-foreground">{fmt(proj.eta)}</span>
                      </>
                    ) : (
                      "Complete a topic to see a projected finish date"
                    )}
                  </span>
                )}
                {target && !proj.done && (
                  <span className={cn("flex items-center gap-1.5", onTrack ? "text-primary" : "text-amber-400")}>
                    <Target className="size-3.5" />
                    Goal {fmt(target)} — need {neededPerWeek !== null && isFinite(neededPerWeek) ? neededPerWeek.toFixed(1) : "—"}/week
                    {onTrack ? " · on track" : " · behind"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="fade-up">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                Today&apos;s target <Clock className="size-4 text-primary/80" />
              </CardDescription>
              <CardTitle className="tabular text-2xl">
                {minutesLabel(todayMinutes)} <span className="text-sm font-normal text-muted-foreground">/ {minutesLabel(dailyTarget)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={dailyTarget ? (todayMinutes / dailyTarget) * 100 : 0} />
              <p className="mt-2 text-xs text-muted-foreground">
                {todayMinutes >= dailyTarget ? "Daily target reached." : `${minutesLabel(dailyTarget - todayMinutes)} to go today.`}
              </p>
            </CardContent>
          </Card>
          <Card className="fade-up">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center justify-between">
                This week <Target className="size-4 text-primary/80" />
              </CardDescription>
              <CardTitle className="tabular text-2xl">
                {hours(week.minutes)}h <span className="text-sm font-normal text-muted-foreground">/ {hours(week.goal.minutes)}h</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={week.goal.minutes ? (week.minutes / week.goal.minutes) * 100 : 0} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Topics completed</span>
                <span className="tabular text-foreground">
                  {week.topicsCompleted} / {week.goal.topics}
                </span>
              </div>
              <Progress value={week.goal.topics ? (week.topicsCompleted / week.goal.topics) * 100 : 0} className="h-1.5" indicatorClassName="bg-chart-2" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Topics completed" value={progress.completed} sub={`of ${progress.total}`} icon={CheckCircle2} />
        <StatCard label="In progress" value={progress.inProgress} sub="topics underway" icon={CircleDashed} />
        <StatCard label="Remaining" value={progress.total - progress.completed} sub="topics left" icon={BookOpen} />
        <StatCard label="Total study time" value={`${hours(totalMinutes)}h`} sub={`${streak.totalDays} study days`} icon={Clock} />
        <StatCard
          label="Study streak"
          value={
            <span className="flex items-center gap-1.5">
              {streak.current}
              <span className="text-sm font-normal text-muted-foreground">day{streak.current === 1 ? "" : "s"}</span>
            </span>
          }
          sub={`Longest: ${streak.longest} · ${streak.studiedToday ? "studied today" : "not yet today"}`}
          icon={Flame}
          className="col-span-2 lg:col-span-1"
          accent={streak.current > 0}
        />
      </div>

      {/* Charts */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="fade-up lg:col-span-3">
          <Tabs defaultValue="week">
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Weekly progress</CardTitle>
                <CardDescription>Study time vs target · dashed line is your target</CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="week">This week</TabsTrigger>
                <TabsTrigger value="weeks">Last 8 weeks</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="week" className="mt-0">
                <p className="mb-2 text-xs text-muted-foreground">
                  {fmt(week.start, "d MMM")} – {fmt(week.end, "d MMM")} · {minutesLabel(week.minutes)} so far
                </p>
                <SimpleBars
                  data={weekData}
                  xKey="day"
                  yKey="minutes"
                  name="Study time"
                  target={dailyTarget}
                  highlightKey={fmt(today, "EEE")}
                  tooltipLabel={(d) => {
                    const row = weekData.find((w) => w.day === d);
                    return row ? fmt(row.date, "EEEE d MMM") : d;
                  }}
                />
              </TabsContent>
              <TabsContent value="weeks" className="mt-0">
                <p className="mb-2 text-xs text-muted-foreground">Weekly totals vs your {hours(profile.weekly_target_minutes)}h weekly target</p>
                <SimpleBars
                  data={last8}
                  xKey="week"
                  yKey="minutes"
                  name="Study time"
                  target={profile.weekly_target_minutes}
                  highlightKey={last8[7].week}
                  tooltipLabel={(w) => `Week of ${w}`}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
        <Card className="fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Study time distribution</CardTitle>
            <CardDescription>All-time, from logged sessions and check-ins</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="activity">
              <TabsList>
                <TabsTrigger value="activity">By activity</TabsTrigger>
                <TabsTrigger value="chapter">By chapter</TabsTrigger>
              </TabsList>
              <TabsContent value="activity">
                {activity.length ? (
                  <Donut data={activity} centerValue={`${hours(totalMinutes)}h`} centerLabel="total" height={150} />
                ) : (
                  <p className="py-10 text-center text-xs text-muted-foreground">Log a check-in or study session to see this.</p>
                )}
              </TabsContent>
              <TabsContent value="chapter">
                {chapterDist.length ? (
                  <Donut data={chapterDist} centerValue={`${chapterDist.length}`} centerLabel="chapters" height={150} />
                ) : (
                  <p className="py-10 text-center text-xs text-muted-foreground">Link sessions or check-ins to topics to see time per chapter.</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Tasks + chapters */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="fade-up">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming study tasks</CardTitle>
              <CardDescription>Overdue and next two weeks</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/planner">
                Planner <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState icon={ListTodo} title="No upcoming tasks" description="Plan your next sessions in the Study Planner." className="py-8" />
            ) : (
              <ul className="divide-y divide-border/60">
                {upcoming.map((t) => {
                  const d = t.scheduled_date ?? t.deadline;
                  const overdue = d ? diffDays(d, today) < 0 : false;
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{t.title}</div>
                        <div className={cn("text-xs", overdue ? "text-amber-400" : "text-muted-foreground")}>
                          {d ? relativeDay(d, today) : "Unscheduled"}
                          {t.deadline && t.scheduled_date && ` · due ${relativeDay(t.deadline, today).toLowerCase()}`}
                          {t.planned_minutes > 0 && ` · ${minutesLabel(t.planned_minutes)}`}
                        </div>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="fade-up">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Chapter progress</CardTitle>
              <CardDescription>Completed topics per chapter</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/book">
                My Book <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {progress.chapters.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No chapters yet"
                description="Add the book's structure to start tracking."
                action={
                  <Button asChild size="sm">
                    <Link href="/book">Set up my book</Link>
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <ul className="space-y-3">
                {progress.chapters.slice(0, 8).map((c) => (
                  <li key={c.chapter.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate pr-3">{chapterLabel(c.chapter)}</span>
                      <span className="tabular shrink-0 text-muted-foreground">
                        {c.completed}/{c.total} · {Math.round(c.pct)}%
                      </span>
                    </div>
                    <Progress value={c.pct} className="h-1.5" />
                  </li>
                ))}
                {progress.chapters.length > 8 && (
                  <li className="text-xs text-muted-foreground">+{progress.chapters.length - 8} more chapters</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
