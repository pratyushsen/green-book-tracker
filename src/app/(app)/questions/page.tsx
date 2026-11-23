"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Pencil,
  Percent,
  Plus,
  Search,
  Star,
  Target,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Difficulty, InterviewQuestion } from "@/lib/types";
import { questionStats, type QuestionStat } from "@/lib/metrics";
import { fmt } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ConfirmDialog,
  DIFFICULTY_META,
  DifficultyBadge,
  EmptyState,
  EnumSelect,
  Field,
  PageHeader,
  StatCard,
  TopicSelect,
  intOr,
} from "@/components/shared";

const DIFF_OPTIONS = [
  { value: "none", label: "Not set" },
  ...(Object.keys(DIFFICULTY_META) as Difficulty[]).map((v) => ({ value: v, label: DIFFICULTY_META[v].label })),
];

function QuestionDialog({ open, onOpenChange, question }: { open: boolean; onOpenChange: (o: boolean) => void; question: InterviewQuestion | null }) {
  const { data, create, update } = useStore();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<string>("none");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [tags, setTags] = useState("");
  const [solution, setSolution] = useState("");
  const categories = [...new Set(data.interview_questions.map((q) => q.category).filter(Boolean))] as string[];

  useEffect(() => {
    if (!open) return;
    setTitle(question?.title ?? "");
    setBody(question?.body ?? "");
    setCategory(question?.category ?? "");
    setDifficulty(question?.difficulty ?? "none");
    setTopicId(question?.topic_id ?? null);
    setSource(question?.source ?? "");
    setTags((question?.tags ?? []).join(", "));
    setSolution(question?.solution ?? "");
  }, [open, question]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      body: body.trim() || null,
      category: category.trim() || null,
      difficulty: difficulty === "none" ? null : (difficulty as Difficulty),
      topic_id: topicId,
      source: source.trim() || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      solution: solution.trim() || null,
    };
    if (question) await update("interview_questions", question.id, payload);
    else await create("interview_questions", [{ ...payload, starred: false }]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add interview question"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Short title" htmlFor="q-title">
            <Input id="q-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="A name you'll recognise it by" />
          </Field>
          <Field label="Question" htmlFor="q-body">
            <Textarea id="q-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Full problem statement" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category" htmlFor="q-cat">
              <Input id="q-cat" list="q-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Probability" />
              <datalist id="q-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Difficulty">
              <EnumSelect value={difficulty} options={DIFF_OPTIONS} onChange={setDifficulty} />
            </Field>
            <Field label="Source" htmlFor="q-src">
              <Input id="q-src" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Book, firm, website…" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Related topic">
              <TopicSelect value={topicId} onChange={setTopicId} />
            </Field>
            <Field label="Tags (comma separated)" htmlFor="q-tags">
              <Input id="q-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
          </div>
          <Field label="Solution / approach" htmlFor="q-sol" hint="Hidden by default in the list so you can attempt it first.">
            <Textarea id="q-sol" rows={4} value={solution} onChange={(e) => setSolution(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{question ? "Save" : "Add question"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttemptDialog({ question, onClose }: { question: InterviewQuestion | null; onClose: () => void }) {
  const { today, create } = useStore();
  const [date, setDate] = useState(today);
  const [correct, setCorrect] = useState(true);
  const [time, setTime] = useState("");
  const [mistake, setMistake] = useState("");
  const [lesson, setLesson] = useState("");
  useEffect(() => {
    setDate(today);
    setCorrect(true);
    setTime("");
    setMistake("");
    setLesson("");
  }, [question, today]);
  return (
    <Dialog open={!!question} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record attempt</DialogTitle>
          <DialogDescription>{question?.title}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!question) return;
            const rows = await create("question_attempts", [
              {
                question_id: question.id,
                attempted_on: date,
                correct,
                time_spent_minutes: time ? Math.max(0, intOr(time)) : null,
                mistake: mistake.trim() || null,
                lesson: lesson.trim() || null,
              },
            ]);
            if (rows.length) toast.success(correct ? "Nice — marked as solved" : "Attempt recorded");
            onClose();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={correct === v}
                onClick={() => setCorrect(v)}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors",
                  correct === v
                    ? v
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-red-500/50 bg-red-500/10"
                    : "border-input text-muted-foreground hover:bg-accent",
                )}
              >
                {v ? <CheckCircle2 className="size-4 text-emerald-400" /> : <XCircle className="size-4 text-red-400" />}
                {v ? "Solved correctly" : "Got it wrong"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="at-date">
              <Input id="at-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Time spent (min)" htmlFor="at-time">
              <Input id="at-time" type="number" min={0} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Mistake made" htmlFor="at-mistake">
            <Textarea id="at-mistake" rows={2} value={mistake} onChange={(e) => setMistake(e.target.value)} placeholder="What went wrong?" />
          </Field>
          <Field label="Lesson learned" htmlFor="at-lesson">
            <Textarea id="at-lesson" rows={2} value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="What will you do differently?" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save attempt</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionCard({
  stat,
  onEdit,
  onAttempt,
  onDelete,
}: {
  stat: QuestionStat;
  onEdit: () => void;
  onAttempt: () => void;
  onDelete: () => void;
}) {
  const { data, update, remove } = useStore();
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const q = stat.question;
  const topic = q.topic_id ? data.topics.find((t) => t.id === q.topic_id) : null;
  return (
    <div className="fade-up rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() => void update("interview_questions", q.id, { starred: !q.starred })}
          aria-label={q.starred ? "Unstar" : "Star"}
          className="mt-0.5 cursor-pointer"
        >
          <Star className={cn("size-4", q.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50 hover:text-muted-foreground")} />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{q.title}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {q.category && <Badge variant="secondary">{q.category}</Badge>}
            <DifficultyBadge difficulty={q.difficulty} />
            {q.tags.map((t) => (
              <Badge key={t} variant="outline">
                #{t}
              </Badge>
            ))}
            {topic && <span className="text-[11px] text-muted-foreground">· {topic.title}</span>}
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {stat.attempts.length === 0 ? (
            <Badge variant="outline">Not attempted</Badge>
          ) : stat.solved ? (
            <Badge variant="success">
              <CheckCircle2 /> Solved
            </Badge>
          ) : (
            <Badge variant="danger">
              <XCircle /> Unsolved
            </Badge>
          )}
          <span className="tabular text-[11px] text-muted-foreground">
            {stat.attempts.length} attempt{stat.attempts.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-4">
          {q.body && <p className="text-sm whitespace-pre-wrap text-foreground/90">{q.body}</p>}
          {q.source && <p className="text-xs text-muted-foreground">Source: {q.source}</p>}
          {q.solution && (
            <div>
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setReveal((r) => !r)}>
                {reveal ? <EyeOff /> : <Eye />} {reveal ? "Hide solution" : "Reveal solution"}
              </Button>
              {reveal && <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm whitespace-pre-wrap">{q.solution}</div>}
            </div>
          )}
          {stat.attempts.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Attempt history</div>
              <ul className="space-y-1.5">
                {stat.attempts.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                    {a.correct ? <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-400" /> : <XCircle className="mt-0.5 size-3.5 text-red-400" />}
                    <div className="flex-1">
                      <span className="tabular font-medium">{fmt(a.attempted_on)}</span>
                      {a.time_spent_minutes != null && <span className="text-muted-foreground"> · {a.time_spent_minutes} min</span>}
                      {a.mistake && <p className="mt-0.5 text-muted-foreground">Mistake: {a.mistake}</p>}
                      {a.lesson && <p className="mt-0.5 text-muted-foreground">Lesson: {a.lesson}</p>}
                    </div>
                    <button aria-label="Delete attempt" className="cursor-pointer text-muted-foreground hover:text-red-400" onClick={() => void remove("question_attempts", [a.id])}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAttempt}>
              <Target /> Record attempt
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type Filter = "all" | "unattempted" | "solved" | "unsolved" | "starred";

export default function QuestionsPage() {
  const { data, remove } = useStore();
  const qs = useMemo(() => questionStats(data), [data]);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [diff, setDiff] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<{ open: boolean; q: InterviewQuestion | null }>({ open: false, q: null });
  const [attempting, setAttempting] = useState<InterviewQuestion | null>(null);
  const [deleting, setDeleting] = useState<InterviewQuestion | null>(null);
  const categories = [...new Set(data.interview_questions.map((q) => q.category).filter(Boolean))].sort() as string[];

  const shown = qs.stats
    .filter((s) => {
      const q = s.question;
      const text = [q.title, q.body, q.category, ...q.tags].join(" ").toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (cat !== "all" && q.category !== cat) return false;
      if (diff !== "all" && q.difficulty !== diff) return false;
      if (filter === "unattempted" && s.attempts.length) return false;
      if (filter === "solved" && !s.solved) return false;
      if (filter === "unsolved" && (s.solved || !s.attempts.length)) return false;
      if (filter === "starred" && !q.starred) return false;
      return true;
    })
    .sort((a, b) => Number(b.question.starred) - Number(a.question.starred) || (b.question.created_at ?? "").localeCompare(a.question.created_at ?? ""));

  const titleOf = new Map(data.interview_questions.map((q) => [q.id, q.title]));
  const lessons = [...data.question_attempts]
    .filter((a) => a.mistake || a.lesson)
    .sort((a, b) => b.attempted_on.localeCompare(a.attempted_on));

  return (
    <>
      <PageHeader
        title="Question Bank"
        description="Your own collection of quant interview questions, with attempts, mistakes and lessons."
        actions={
          <Button size="sm" onClick={() => setDialog({ open: true, q: null })}>
            <Plus /> Add question
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Questions" value={qs.total} icon={MessageSquareText} />
        <StatCard label="Attempted" value={qs.attempted} sub={`${qs.totalAttempts} total attempts`} icon={ListChecks} />
        <StatCard label="Solved correctly" value={qs.solved} sub={qs.total ? `${Math.round((qs.solved / qs.total) * 100)}% of bank` : undefined} icon={CheckCircle2} />
        <StatCard label="Attempt accuracy" value={`${Math.round(qs.accuracy)}%`} sub={`${qs.correctAttempts}/${qs.totalAttempts} correct`} icon={Percent} />
      </div>
      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="lessons">Mistakes & lessons ({lessons.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          {qs.total === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="No questions yet"
              description="Add interview questions you come across — from the book, mock interviews or forums — and track your attempts."
              action={
                <Button onClick={() => setDialog({ open: true, q: null })}>
                  <Plus /> Add your first question
                </Button>
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 lg:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions, tags…" className="pl-9" />
                </div>
                <EnumSelect value={cat} onChange={setCat} options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} className="lg:w-44" />
                <EnumSelect value={diff} onChange={setDiff} options={[{ value: "all", label: "All difficulties" }, ...DIFF_OPTIONS.slice(1)]} className="lg:w-40" />
                <EnumSelect
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "Any status" },
                    { value: "unattempted", label: "Not attempted" },
                    { value: "solved", label: "Solved" },
                    { value: "unsolved", label: "Attempted, unsolved" },
                    { value: "starred", label: "Starred" },
                  ]}
                  className="lg:w-48"
                />
              </div>
              <div className="space-y-3">
                {shown.map((s) => (
                  <QuestionCard
                    key={s.question.id}
                    stat={s}
                    onEdit={() => setDialog({ open: true, q: s.question })}
                    onAttempt={() => setAttempting(s.question)}
                    onDelete={() => setDeleting(s.question)}
                  />
                ))}
                {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No questions match these filters.</p>}
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="lessons">
          {lessons.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No mistakes recorded yet" description="When you record an attempt, note the mistake and lesson — they collect here for review before interviews." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border/60">
                  {lessons.map((a) => (
                    <li key={a.id} className="grid gap-2 p-4 sm:grid-cols-[180px_1fr]">
                      <div>
                        <div className="text-sm font-medium">{titleOf.get(a.question_id)}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {a.correct ? <CheckCircle2 className="size-3 text-emerald-400" /> : <XCircle className="size-3 text-red-400" />}
                          {fmt(a.attempted_on)}
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-red-400/80">Mistake</div>
                          <p className="mt-0.5 text-muted-foreground">{a.mistake || "—"}</p>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-primary">Lesson</div>
                          <p className="mt-0.5 text-muted-foreground">{a.lesson || "—"}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <QuestionDialog open={dialog.open} question={dialog.q} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))} />
      <AttemptDialog question={attempting} onClose={() => setAttempting(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this question?"
        description="Its attempt history will be deleted too."
        onConfirm={async () => {
          if (deleting) await remove("interview_questions", [deleting.id]);
        }}
      />
    </>
  );
}
