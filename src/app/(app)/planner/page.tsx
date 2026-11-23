"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  SkipForward,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { StudyTask } from "@/lib/types";
import { dailyTargetFor, minutesByDate, weekSummary } from "@/lib/metrics";
import { diffDays, fmt, hours, minutesLabel, relativeDay, shift } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Field, PageHeader, PriorityBadge, PRIORITY_META, intOr } from "@/components/shared";
import { TaskDialog } from "@/components/planner/task-dialog";
import { SessionDialog } from "@/components/session-dialog";
import { ChartFrame, ChartTooltip, SERIES, axisProps, minuteTick, minuteTicks } from "@/components/charts/chart-kit";

const sortTasks = (a: StudyTask, b: StudyTask) =>
  Number(a.status === "done" || a.status === "skipped") - Number(b.status === "done" || b.status === "skipped") ||
  PRIORITY_META[b.priority].rank - PRIORITY_META[a.priority].rank ||
  (a.created_at ?? "").localeCompare(b.created_at ?? "");

function RescheduleDialog({ task, onClose }: { task: StudyTask | null; onClose: () => void }) {
  const { today, rescheduleTask } = useStore();
  const [date, setDate] = useState(today);
  useEffect(() => setDate(today), [task, today]);
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule task</DialogTitle>
          <DialogDescription>{task?.title}</DialogDescription>
        </DialogHeader>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (task && date) await rescheduleTask(task, date);
              onClose();
            }}
          >
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { data, profile, create, update, remove } = useStore();
  const current = date ? dailyTargetFor(data, profile, date) : null;
  const [minutes, setMinutes] = useState("");
  const [problems, setProblems] = useState("");
  useEffect(() => {
    if (current) {
      setMinutes(String(current.minutes));
      setProblems(String(current.problems));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);
  if (!date || !current) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Daily target · {fmt(date, "EEE d MMM")}</DialogTitle>
          <DialogDescription>Default is {minutesLabel(profile.daily_target_minutes)} (change it in Settings).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minutes" htmlFor="dt-min">
            <Input id="dt-min" type="number" min={0} max={1440} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <Field label="Problems" htmlFor="dt-prob">
            <Input id="dt-prob" type="number" min={0} value={problems} onChange={(e) => setProblems(e.target.value)} />
          </Field>
        </div>
        <DialogFooter className="sm:justify-between">
          {current.override ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await remove("daily_targets", [current.override!.id]);
                onClose();
              }}
            >
              <Undo2 /> Use default
            </Button>
          ) : (
            <span />
          )}
          <Button
            onClick={async () => {
              const payload = { target_minutes: Math.min(1440, Math.max(0, intOr(minutes))), target_problems: Math.max(0, intOr(problems)) };
              if (current.override) await update("daily_targets", current.override.id, payload);
              else await create("daily_targets", [{ date, ...payload }]);
              onClose();
            }}
          >
            Save target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskItem({
  task,
  onEdit,
  onReschedule,
  compact,
}: {
  task: StudyTask;
  onEdit: () => void;
  onReschedule: () => void;
  compact?: boolean;
}) {
  const { update, remove, rescheduleTask, today } = useStore();
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const overdueDeadline = task.deadline && !done && diffDays(task.deadline, today) < 0;
  return (
    <div className={cn("group relative flex items-start gap-2 rounded-lg border border-border bg-background/40 p-2.5 transition-colors hover:border-primary/30", (done || skipped) && "opacity-60")}>
      <Checkbox
        className="mt-0.5"
        checked={done}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onCheckedChange={(v) =>
          void update("study_tasks", task.id, { status: v ? "done" : "todo", completed_at: v ? new Date().toISOString() : null })
        }
      />
      <button onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left">
        <div className={cn("text-[13px] leading-snug", done && "line-through")}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {!compact && <PriorityBadge priority={task.priority} />}
          {compact && task.priority !== "medium" && task.priority !== "low" && <PriorityBadge priority={task.priority} />}
          {task.planned_minutes > 0 && <span className="tabular">{minutesLabel(task.planned_minutes)}</span>}
          {task.deadline && (
            <span className={cn("flex items-center gap-0.5", overdueDeadline && "text-red-400")}>
              <AlarmClock className="size-3" /> {fmt(task.deadline, "d MMM")}
            </span>
          )}
          {skipped && <span>skipped</span>}
          {task.rescheduled_count > 0 && <span>↷{task.rescheduled_count}</span>}
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "opacity-60 group-hover:opacity-100 focus-visible:opacity-100",
              compact && "xl:absolute xl:top-1 xl:right-1 xl:bg-card xl:opacity-0",
            )}
            aria-label="Task actions"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void rescheduleTask(task, today)}>
            <CalendarClock /> Move to today
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void rescheduleTask(task, shift(task.scheduled_date && task.scheduled_date > today ? task.scheduled_date : today, 1))}>
            <SkipForward /> Push one day
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReschedule}>
            <CalendarRange /> Pick a date…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void update("study_tasks", task.id, { status: skipped ? "todo" : "skipped" })}>
            <Undo2 /> {skipped ? "Un-skip" : "Skip"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void remove("study_tasks", [task.id])}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function WeeklyGoalCard({ weekStart }: { weekStart: string }) {
  const { data, profile, today, create, update } = useStore();
  const week = weekSummary(data, profile, today, Math.round(diffDays(weekStart, weekSummary(data, profile, today).start) / 7));
  const [editing, setEditing] = useState(false);
  const [hrs, setHrs] = useState("");
  const [topics, setTopics] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setHrs(String(hours(week.goal.minutes)));
    setTopics(String(week.goal.topics));
    setNotes(week.goal.goal?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, editing]);

  async function save() {
    const payload = {
      target_minutes: Math.max(0, Math.round(parseFloat(hrs || "0") * 60)),
      target_topics: Math.max(0, intOr(topics)),
      notes: notes.trim() || null,
    };
    if (week.goal.goal) await update("weekly_goals", week.goal.goal.id, payload);
    else await create("weekly_goals", [{ week_start: weekStart, ...payload }]);
    toast.success("Weekly goal saved");
    setEditing(false);
  }

  return (
    <Card className="fade-up">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-primary" /> Weekly goal
          </CardTitle>
          <CardDescription>
            {fmt(week.start, "d MMM")} – {fmt(week.end, "d MMM")} {week.goal.goal ? "" : "· using defaults"}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Study hours" htmlFor="wg-h">
                <Input id="wg-h" type="number" min={0} step={0.5} value={hrs} onChange={(e) => setHrs(e.target.value)} />
              </Field>
              <Field label="Topics to complete" htmlFor="wg-t">
                <Input id="wg-t" type="number" min={0} value={topics} onChange={(e) => setTopics(e.target.value)} />
              </Field>
            </div>
            <Field label="Focus for the week" htmlFor="wg-n">
              <Textarea id="wg-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Button size="sm" onClick={() => void save()}>
              Save goal
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">Study time</span>
                <span className="tabular">
                  {hours(week.minutes)}h / {hours(week.goal.minutes)}h
                </span>
              </div>
              <Progress value={week.goal.minutes ? (week.minutes / week.goal.minutes) * 100 : 0} />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-muted-foreground">Topics completed</span>
                <span className="tabular">
                  {week.topicsCompleted} / {week.goal.topics}
                </span>
              </div>
              <Progress value={week.goal.topics ? (week.topicsCompleted / week.goal.topics) * 100 : 0} indicatorClassName="bg-chart-2" />
            </div>
            {week.goal.goal?.notes && <p className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">{week.goal.goal.notes}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlannerPage() {
  const { data, profile, today, rescheduleTask } = useStore();
  const [offset, setOffset] = useState(0);
  const week = useMemo(() => weekSummary(data, profile, today, offset), [data, profile, today, offset]);
  const mins = useMemo(() => minutesByDate(data), [data]);
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: StudyTask | null; date: string | null }>({ open: false, task: null, date: null });
  const [resched, setResched] = useState<StudyTask | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);

  const open = data.study_tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const overdue = open.filter((t) => t.scheduled_date && t.scheduled_date < today).sort(sortTasks);
  const backlog = open.filter((t) => !t.scheduled_date).sort(sortTasks);
  const deadlines = open
    .filter((t) => t.deadline)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 8);

  const chart = week.days.map((d) => ({
    day: fmt(d, "EEE"),
    Planned: data.study_tasks.filter((t) => t.scheduled_date === d && t.status !== "skipped").reduce((a, t) => a + t.planned_minutes, 0),
    Actual: mins.get(d) ?? 0,
  }));
  const planTicks = minuteTicks(Math.max(60, ...chart.flatMap((c) => [c.Planned, c.Actual])) * 1.05);
  const plannedTotal = chart.reduce((a, c) => a + c.Planned, 0);
  const actualTotal = chart.reduce((a, c) => a + c.Actual, 0);

  async function moveAllOverdue() {
    for (const t of overdue) await rescheduleTask(t, today);
    toast.success(`Moved ${overdue.length} task${overdue.length === 1 ? "" : "s"} to today`);
  }

  const openNew = (date: string | null) => setTaskDialog({ open: true, task: null, date });
  const openEdit = (task: StudyTask) => setTaskDialog({ open: true, task, date: null });

  return (
    <>
      <PageHeader
        title="Study Planner"
        description="Schedule topics, set targets and keep unfinished work moving."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setSessionOpen(true)}>
              <Clock /> Log session
            </Button>
            <Button size="sm" onClick={() => openNew(today)}>
              <Plus /> New task
            </Button>
          </>
        }
      />

      {overdue.length > 0 && (
        <div className="fade-up mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center">
          <AlarmClock className="size-5 shrink-0 text-amber-400" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-amber-200">
              {overdue.length} unfinished task{overdue.length === 1 ? "" : "s"} from earlier days
            </span>
            <p className="text-xs text-muted-foreground">{overdue.slice(0, 3).map((t) => t.title).join(" · ")}{overdue.length > 3 ? " …" : ""}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void moveAllOverdue()}>
            <CalendarClock /> Reschedule all to today
          </Button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
            This week
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="tabular text-sm text-muted-foreground">
          {fmt(week.start, "d MMM")} – {fmt(week.end, "d MMM yyyy")}
        </div>
      </div>

      {/* Week board */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {week.days.map((d) => {
          const tasks = data.study_tasks.filter((t) => t.scheduled_date === d).sort(sortTasks);
          const planned = tasks.filter((t) => t.status !== "skipped").reduce((a, t) => a + t.planned_minutes, 0);
          const actual = mins.get(d) ?? 0;
          const target = dailyTargetFor(data, profile, d);
          const isToday = d === today;
          return (
            <div key={d} className={cn("fade-up flex min-h-48 flex-col rounded-xl border bg-card", isToday ? "border-primary/50" : "border-border")}>
              <div className="border-b border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className={cn("text-xs font-semibold", isToday && "text-primary")}>{fmt(d, "EEEE")}</div>
                    <div className="tabular text-[11px] text-muted-foreground">{fmt(d, "d MMM")}</div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Add task on ${fmt(d, "EEEE")}`} onClick={() => openNew(d)}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <button onClick={() => setTargetDate(d)} className="mt-2 block w-full cursor-pointer text-left" aria-label="Edit daily target">
                  <div className="tabular flex justify-between text-[10px] text-muted-foreground">
                    <span>
                      {minutesLabel(actual)} / {minutesLabel(target.minutes)}
                      {target.override && " *"}
                    </span>
                    <span>plan {minutesLabel(planned)}</span>
                  </div>
                  <Progress value={target.minutes ? (actual / target.minutes) * 100 : 0} className="mt-1 h-1" />
                </button>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {tasks.map((t) => (
                  <TaskItem key={t.id} task={t} compact onEdit={() => openEdit(t)} onReschedule={() => setResched(t)} />
                ))}
                {tasks.length === 0 && (
                  <button onClick={() => openNew(d)} className="flex h-full min-h-16 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-border/60 text-[11px] text-muted-foreground hover:border-primary/40">
                    + Plan something
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Click a day&apos;s progress bar to set a custom daily target (marked *).</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Planned vs actual study time</CardTitle>
            <CardDescription>
              This week: planned {minutesLabel(plannedTotal)} · actual {minutesLabel(actualTotal)}
              {plannedTotal > 0 && ` · ${Math.round((actualTotal / plannedTotal) * 100)}% of plan`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartFrame height={230} label="Planned versus actual study minutes per day">
              <BarChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" {...axisProps} />
                <YAxis {...axisProps} width={48} ticks={planTicks} domain={[0, planTicks[planTicks.length - 1]]} tickFormatter={minuteTick} />
                <Tooltip content={<ChartTooltip format="minutes" />} />
                <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Planned" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="Actual" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ChartFrame>
          </CardContent>
        </Card>
        <WeeklyGoalCard weekStart={week.start} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="fade-up">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Backlog</CardTitle>
              <CardDescription>Unscheduled tasks</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => openNew(null)}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {backlog.length === 0 ? (
              <EmptyState icon={Inbox} title="Backlog is empty" className="py-8" />
            ) : (
              backlog.map((t) => <TaskItem key={t.id} task={t} onEdit={() => openEdit(t)} onReschedule={() => setResched(t)} />)
            )}
          </CardContent>
        </Card>
        <Card className="fade-up">
          <CardHeader>
            <CardTitle>Deadlines</CardTitle>
            <CardDescription>Open tasks with a deadline, soonest first</CardDescription>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <EmptyState icon={AlarmClock} title="No deadlines set" className="py-8" />
            ) : (
              <ul className="divide-y divide-border/60">
                {deadlines.map((t) => {
                  const n = diffDays(t.deadline!, today);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => openEdit(t)}>
                        <div className="truncate text-sm">{t.title}</div>
                        <div className={cn("text-xs", n < 0 ? "text-red-400" : n <= 2 ? "text-amber-400" : "text-muted-foreground")}>
                          {n < 0 ? `Overdue by ${-n} day${n === -1 ? "" : "s"}` : `Due ${relativeDay(t.deadline!, today).toLowerCase()}`}
                        </div>
                      </button>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <TaskDialog open={taskDialog.open} task={taskDialog.task} defaultDate={taskDialog.date} onOpenChange={(o) => setTaskDialog((s) => ({ ...s, open: o }))} />
      <RescheduleDialog task={resched} onClose={() => setResched(null)} />
      <TargetDialog date={targetDate} onClose={() => setTargetDate(null)} />
      <SessionDialog open={sessionOpen} onOpenChange={setSessionOpen} />
    </>
  );
}
