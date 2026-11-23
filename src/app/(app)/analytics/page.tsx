"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Clock, Gauge, Minus, Puzzle, Trophy } from "lucide-react";
import { useStore } from "@/lib/data/store";
import {
  bookProgress,
  dailySeries,
  minutesByDate,
  problemsByDate,
  questionStats,
  weekSummary,
} from "@/lib/metrics";
import { fmt, hours, minutesLabel, rangeDays, shift, weekDays, weekStartOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader, StatCard, chapterLabel } from "@/components/shared";
import { ChartFrame, ChartTooltip, SERIES, SimpleBars, axisProps, minuteTick, minuteTicks } from "@/components/charts/chart-kit";
import type { Difficulty } from "@/lib/types";

type Range = "30" | "90" | "180" | "all";

function Delta({ now, prev, unit = "" }: { now: number; prev: number; unit?: string }) {
  const d = now - prev;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs", d > 0 ? "text-primary" : d < 0 ? "text-amber-400" : "text-muted-foreground")}>
      <Icon className="size-3.5" />
      {d > 0 ? "+" : ""}
      {Math.round(d * 10) / 10}
      {unit} vs last week
    </span>
  );
}

function Heatmap({ weeks = 26 }: { weeks?: number }) {
  const { data, profile, today } = useStore();
  const mins = useMemo(() => minutesByDate(data), [data]);
  const start = shift(weekStartOf(today, profile.week_starts_on), -(weeks - 1) * 7);
  const cols = Array.from({ length: weeks }, (_, i) => weekDays(shift(start, i * 7)));
  const max = Math.max(60, ...[...mins.values()]);
  const level = (m: number) => (m <= 0 ? 0 : Math.min(4, Math.ceil((m / max) * 4)));
  const BG = ["bg-muted/50", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px]">
        <div className="mr-1 flex flex-col gap-[3px] text-[9px] text-muted-foreground">
          {cols[0].map((d, i) => (
            <div key={d} className="flex h-3 items-center">
              {i % 2 === 0 ? fmt(d, "EEE") : ""}
            </div>
          ))}
        </div>
        {cols.map((week) => (
          <div key={week[0]} className="flex flex-col gap-[3px]">
            {week.map((d) => {
              const m = mins.get(d) ?? 0;
              return (
                <UITooltip key={d}>
                  <TooltipTrigger asChild>
                    <div className={cn("size-3 rounded-[3px]", d > today ? "opacity-0" : BG[level(m)])} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {fmt(d, "EEE d MMM")}: {minutesLabel(m)}
                  </TooltipContent>
                </UITooltip>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        Less {BG.map((b) => <span key={b} className={cn("size-3 rounded-[3px]", b)} />)} More
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { data, profile, today } = useStore();
  const [range, setRange] = useState<Range>("30");

  const earliest = useMemo(() => {
    const all = [...data.study_sessions.map((s) => s.date), ...data.check_ins.map((c) => c.date), ...data.topics.map((t) => t.completed_on ?? "")].filter(Boolean).sort();
    return all[0] ?? shift(today, -29);
  }, [data, today]);
  const from = range === "all" ? (earliest < shift(today, -29) ? earliest : shift(today, -29)) : shift(today, -(Number(range) - 1));

  const series = useMemo(() => dailySeries(data, profile, from, today), [data, profile, from, today]);
  const total = series.reduce((a, d) => a + d.minutes, 0);
  const studyDays = series.filter((d) => d.minutes > 0).length;
  const hit = series.filter((d) => d.minutes > 0 && d.minutes >= d.target).length;
  const problems = series.reduce((a, d) => a + d.problems, 0);
  const best = series.reduce((b, d) => (d.minutes > b.minutes ? d : b), { date: "", minutes: 0 } as { date: string; minutes: number });

  const thisWeek = weekSummary(data, profile, today, 0);
  const lastWeek = weekSummary(data, profile, today, -1);
  const probs = problemsByDate(data);
  const weekProblems = (days: string[]) => days.reduce((a, d) => a + (probs.get(d) ?? 0), 0);

  const weeks = Array.from({ length: 12 }, (_, i) => weekSummary(data, profile, today, i - 11)).map((w) => ({
    week: fmt(w.start, "d MMM"),
    minutes: w.minutes,
    problems: weekProblems(w.days),
    topics: w.topicsCompleted,
  }));

  // Burn-up: cumulative completed topics
  const progress = bookProgress(data);
  const burn = useMemo(() => {
    const days = rangeDays(from, today);
    const completions = data.topics.filter((t) => t.completed_on).map((t) => t.completed_on!).sort();
    let i = 0;
    let cum = completions.filter((d) => d < from).length;
    i = cum;
    return days.map((d) => {
      while (i < completions.length && completions[i] <= d) {
        i++;
        cum++;
      }
      return { date: d, completed: cum };
    });
  }, [data.topics, from, today]);

  const confidence = [1, 2, 3, 4, 5].map((n) => ({ level: `${n}★`, topics: data.topics.filter((t) => t.confidence === n).length }));
  const unrated = data.topics.filter((t) => t.confidence === null).length;

  const difficulty = (["easy", "medium", "hard"] as Difficulty[]).map((d) => {
    const ts = data.topics.filter((t) => t.difficulty === d);
    return { name: d[0].toUpperCase() + d.slice(1), Completed: ts.filter((t) => t.status === "completed").length, Remaining: ts.filter((t) => t.status !== "completed").length };
  });

  const qs = questionStats(data);
  const byCat = new Map<string, { attempts: number; correct: number }>();
  for (const s of qs.stats) {
    const c = s.question.category || "Uncategorised";
    const cur = byCat.get(c) ?? { attempts: 0, correct: 0 };
    cur.attempts += s.attempts.length;
    cur.correct += s.attempts.filter((a) => a.correct).length;
    byCat.set(c, cur);
  }
  const accuracy = [...byCat.entries()]
    .filter(([, v]) => v.attempts > 0)
    .map(([k, v]) => ({ category: k, accuracy: (v.correct / v.attempts) * 100, attempts: v.attempts }))
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8);

  const chapterTime = progress.chapters
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10)
    .map((c) => ({ chapter: chapterLabel(c.chapter), minutes: c.minutes }));

  const dailyTicks = minuteTicks(Math.max(profile.daily_target_minutes, ...series.map((d) => d.minutes)) * 1.05);
  const chapterTicks = minuteTicks(Math.max(0, ...chapterTime.map((c) => c.minutes)) * 1.05);
  const tickDate = (d: string) => fmt(d, range === "30" ? "d MMM" : "MMM d");

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trends in your study time, completion pace and interview practice."
        actions={
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="30">30 days</TabsTrigger>
              <TabsTrigger value="90">90 days</TabsTrigger>
              <TabsTrigger value="180">6 months</TabsTrigger>
              <TabsTrigger value="all">All time</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {/* Weekly review */}
      <Card className="card-glow fade-up mb-4">
        <CardHeader>
          <CardTitle>Weekly review</CardTitle>
          <CardDescription>
            This week ({fmt(thisWeek.start, "d MMM")} – {fmt(thisWeek.end, "d MMM")}) compared with last week
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Study time</div>
            <div className="tabular text-xl font-semibold">
              {hours(thisWeek.minutes)}h <span className="text-sm font-normal text-muted-foreground">/ {hours(thisWeek.goal.minutes)}h goal</span>
            </div>
            <Delta now={hours(thisWeek.minutes)} prev={hours(lastWeek.minutes)} unit="h" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Topics completed</div>
            <div className="tabular text-xl font-semibold">
              {thisWeek.topicsCompleted} <span className="text-sm font-normal text-muted-foreground">/ {thisWeek.goal.topics} goal</span>
            </div>
            <Delta now={thisWeek.topicsCompleted} prev={lastWeek.topicsCompleted} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Problems solved</div>
            <div className="tabular text-xl font-semibold">{weekProblems(thisWeek.days)}</div>
            <Delta now={weekProblems(thisWeek.days)} prev={weekProblems(lastWeek.days)} />
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Study time" value={`${hours(total)}h`} sub={`${studyDays} study days in range`} icon={Clock} />
        <StatCard label="Avg per study day" value={minutesLabel(studyDays ? total / studyDays : 0)} sub={best.minutes ? `Best: ${minutesLabel(best.minutes)} on ${fmt(best.date, "d MMM")}` : undefined} icon={Gauge} />
        <StatCard label="Daily target hit" value={`${hit} days`} sub={studyDays ? `${Math.round((hit / series.length) * 100)}% of days in range` : undefined} icon={Trophy} />
        <StatCard label="Problems solved" value={problems} sub="in range" icon={Puzzle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily study time</CardTitle>
            <CardDescription>Minutes per day · dashed line is your default daily target ({minutesLabel(profile.daily_target_minutes)})</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame height={260} label="Daily study minutes">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillStudy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={tickDate} minTickGap={24} />
                <YAxis {...axisProps} width={48} ticks={dailyTicks} domain={[0, dailyTicks[dailyTicks.length - 1]]} tickFormatter={minuteTick} />
                <Tooltip content={<ChartTooltip format="minutes" labelFmt={(d) => fmt(d, "EEE d MMM yyyy")} />} />
                <ReferenceLine y={profile.daily_target_minutes} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} />
                <Area type="monotone" dataKey="minutes" name="Study time" stroke="var(--primary)" strokeWidth={2} fill="url(#fillStudy)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
              </AreaChart>
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Weekly study time</CardTitle>
            <CardDescription>Last 12 weeks · dashed line is your weekly target</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBars data={weeks} xKey="week" yKey="minutes" name="Study time" target={profile.weekly_target_minutes} tooltipLabel={(w) => `Week of ${w}`} />
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Book burn-up</CardTitle>
            <CardDescription>Cumulative topics completed · dashed line is total topics ({progress.total})</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame height={220} label="Cumulative topics completed">
              <LineChart data={burn} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={tickDate} minTickGap={24} />
                <YAxis {...axisProps} width={44} allowDecimals={false} domain={[0, Math.max(progress.total, 1)]} />
                <Tooltip content={<ChartTooltip labelFmt={(d) => fmt(d, "EEE d MMM yyyy")} />} />
                <ReferenceLine y={progress.total} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} />
                <Line type="stepAfter" dataKey="completed" name="Topics completed" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
              </LineChart>
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" /> Activity
            </CardTitle>
            <CardDescription>Study minutes per day over the last 26 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap />
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Problems solved per week</CardTitle>
            <CardDescription>From check-ins and logged sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBars data={weeks} xKey="week" yKey="problems" name="Problems" format="number" tooltipLabel={(w) => `Week of ${w}`} />
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Time by chapter</CardTitle>
            <CardDescription>Top chapters by study time (sessions linked to topics or chapters)</CardDescription>
          </CardHeader>
          <CardContent>
            {chapterTime.length ? (
              <ChartFrame height={Math.max(160, chapterTime.length * 32)} label="Study time by chapter">
                <BarChart data={chapterTime} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" {...axisProps} ticks={chapterTicks} domain={[0, chapterTicks[chapterTicks.length - 1]]} tickFormatter={minuteTick} />
                  <YAxis type="category" dataKey="chapter" {...axisProps} width={140} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
                  <Tooltip content={<ChartTooltip format="minutes" />} />
                  <Bar dataKey="minutes" name="Study time" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ChartFrame>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">Link check-ins or sessions to topics to see this.</p>
            )}
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Confidence distribution</CardTitle>
            <CardDescription>Topics by self-rated confidence · {unrated} unrated</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBars data={confidence} xKey="level" yKey="topics" name="Topics" format="number" height={200} />
          </CardContent>
        </Card>

        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Progress by difficulty</CardTitle>
            <CardDescription>Completed vs remaining topics for each difficulty</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame height={200} label="Completed and remaining topics by difficulty">
              <BarChart data={difficulty} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} width={44} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Completed" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Remaining" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ChartFrame>
          </CardContent>
        </Card>

        <Card className="fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Interview question accuracy by category</CardTitle>
            <CardDescription>Share of attempts solved correctly · overall {Math.round(qs.accuracy)}% across {qs.totalAttempts} attempts</CardDescription>
          </CardHeader>
          <CardContent>
            {accuracy.length ? (
              <SimpleBars data={accuracy} xKey="category" yKey="accuracy" name="Accuracy" format="percent" height={220} />
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">Record attempts in the Question Bank to see accuracy.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
