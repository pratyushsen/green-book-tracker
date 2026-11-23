"use client";

import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Chapter, Difficulty, Topic, TopicStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChapterSelect,
  ConfidenceStars,
  ConfirmDialog,
  DIFFICULTY_META,
  EnumSelect,
  Field,
  STATUS_META,
} from "@/components/shared";
import { fmt } from "@/lib/dates";

const STATUS_OPTIONS = (Object.keys(STATUS_META) as TopicStatus[]).map((v) => ({ value: v, label: STATUS_META[v].label }));
const DIFF_OPTIONS = [
  { value: "none", label: "Not set" },
  ...(Object.keys(DIFFICULTY_META) as Difficulty[]).map((v) => ({ value: v, label: DIFFICULTY_META[v].label })),
];

export function ChapterDialog({
  open,
  onOpenChange,
  chapter,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  chapter?: Chapter | null;
}) {
  const { data, create, update } = useStore();
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setNumber(chapter?.number ?? "");
      setTitle(chapter?.title ?? "");
      setDescription(chapter?.description ?? "");
    }
  }, [open, chapter]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const payload = { number: number.trim() || null, title: title.trim(), description: description.trim() || null };
    if (chapter) await update("chapters", chapter.id, payload);
    else {
      const position = data.chapters.reduce((m, c) => Math.max(m, c.position), -1) + 1;
      await create("chapters", [{ ...payload, position }]);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{chapter ? "Edit chapter" : "Add chapter"}</DialogTitle>
          <DialogDescription>Use your own copy of the book to fill in chapter names.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid grid-cols-[90px_1fr] gap-3">
            <Field label="Number" htmlFor="ch-num">
              <Input id="ch-num" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 2" />
            </Field>
            <Field label="Title" htmlFor="ch-title">
              <Input id="ch-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
            </Field>
          </div>
          <Field label="Description (optional)" htmlFor="ch-desc">
            <Textarea id="ch-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{chapter ? "Save" : "Add chapter"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevisionDialog({
  topic,
  open,
  onOpenChange,
}: {
  topic: Topic | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { today, logRevision } = useStore();
  const [date, setDate] = useState(today);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setDate(today);
      setConfidence(topic?.confidence ?? null);
      setNotes("");
    }
  }, [open, topic, today]);
  if (!topic) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log revision</DialogTitle>
          <DialogDescription>{topic.title}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await logRevision(topic, date, confidence, notes);
            toast.success("Revision logged");
            onOpenChange(false);
          }}
        >
          <Field label="Date" htmlFor="rev-date">
            <Input id="rev-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Confidence after revising">
            <ConfidenceStars value={confidence} onChange={setConfidence} />
          </Field>
          <Field label="Notes" htmlFor="rev-notes">
            <Textarea id="rev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did you re-learn or still struggle with?" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save revision</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TopicForm = Pick<
  Topic,
  | "title"
  | "chapter_id"
  | "status"
  | "difficulty"
  | "confidence"
  | "completed_on"
  | "last_studied_on"
  | "notes"
  | "formulas"
  | "in_revision_list"
>;

export function TopicDialog({
  open,
  onOpenChange,
  topic,
  defaultChapterId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  topic?: Topic | null;
  defaultChapterId?: string | null;
}) {
  const { data, today, create, update, remove } = useStore();
  const [form, setForm] = useState<TopicForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revOpen, setRevOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: topic?.title ?? "",
      chapter_id: topic?.chapter_id ?? defaultChapterId ?? data.chapters[0]?.id ?? "",
      status: topic?.status ?? "not_started",
      difficulty: topic?.difficulty ?? null,
      confidence: topic?.confidence ?? null,
      completed_on: topic?.completed_on ?? null,
      last_studied_on: topic?.last_studied_on ?? null,
      notes: topic?.notes ?? "",
      formulas: topic?.formulas ?? "",
      in_revision_list: topic?.in_revision_list ?? false,
    });
  }, [open, topic, defaultChapterId, data.chapters]);

  if (!form) return null;
  const set = <K extends keyof TopicForm>(k: K, v: TopicForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const revisions = topic
    ? data.revision_records.filter((r) => r.topic_id === topic.id).sort((a, b) => b.revised_on.localeCompare(a.revised_on))
    : [];
  const liveTopic = topic ? (data.topics.find((t) => t.id === topic.id) ?? topic) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !form.title.trim() || !form.chapter_id) {
      toast.error(form?.chapter_id ? "Title is required" : "Create a chapter first");
      return;
    }
    const payload = {
      ...form,
      title: form.title.trim(),
      notes: form.notes?.trim() || null,
      formulas: form.formulas?.trim() || null,
      completed_on: form.status === "completed" ? (form.completed_on ?? today) : null,
      last_studied_on: form.last_studied_on || (form.status !== "not_started" ? today : null),
    };
    if (topic) await update("topics", topic.id, payload);
    else {
      const position = data.topics.filter((t) => t.chapter_id === form.chapter_id).reduce((m, t) => Math.max(m, t.position), -1) + 1;
      await create("topics", [{ ...payload, position }]);
    }
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{topic ? "Edit topic" : "Add topic"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="notes">Notes & formulas</TabsTrigger>
                {topic && <TabsTrigger value="history">Revisions ({revisions.length})</TabsTrigger>}
              </TabsList>

              <TabsContent value="details" className="grid gap-4">
                <Field label="Title" htmlFor="tp-title">
                  <Input id="tp-title" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!topic} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Chapter">
                    <ChapterSelect value={form.chapter_id} onChange={(v) => v && set("chapter_id", v)} placeholder="Select chapter" />
                  </Field>
                  <Field label="Status">
                    <EnumSelect
                      value={form.status}
                      options={STATUS_OPTIONS}
                      onChange={(v) => {
                        set("status", v);
                        if (v === "completed" && !form.completed_on) set("completed_on", today);
                      }}
                    />
                  </Field>
                  <Field label="Difficulty">
                    <EnumSelect
                      value={form.difficulty ?? "none"}
                      options={DIFF_OPTIONS}
                      onChange={(v) => set("difficulty", v === "none" ? null : (v as Difficulty))}
                    />
                  </Field>
                  <Field label="Confidence (1–5)">
                    <div className="flex h-9 items-center">
                      <ConfidenceStars value={form.confidence} onChange={(v) => set("confidence", v)} />
                    </div>
                  </Field>
                  <Field label="Completion date" htmlFor="tp-done" hint={form.status !== "completed" ? "Set automatically when marked completed" : undefined}>
                    <Input
                      id="tp-done"
                      type="date"
                      disabled={form.status !== "completed"}
                      value={form.completed_on ?? ""}
                      onChange={(e) => set("completed_on", e.target.value || null)}
                    />
                  </Field>
                  <Field label="Last studied" htmlFor="tp-last">
                    <Input id="tp-last" type="date" value={form.last_studied_on ?? ""} onChange={(e) => set("last_studied_on", e.target.value || null)} />
                  </Field>
                </div>
                <label className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">On revision list</div>
                    <div className="text-xs text-muted-foreground">Shows up in Revision and in revision-due reminders.</div>
                  </div>
                  <Switch checked={form.in_revision_list} onCheckedChange={(v) => set("in_revision_list", v)} />
                </label>
              </TabsContent>

              <TabsContent value="notes" className="grid gap-4">
                <Field label="Notes" htmlFor="tp-notes">
                  <Textarea id="tp-notes" rows={6} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Key ideas, intuition, pitfalls…" />
                </Field>
                <Field label="Important formulas" htmlFor="tp-formulas" hint="Plain text — one formula per line works well.">
                  <Textarea
                    id="tp-formulas"
                    rows={6}
                    className="font-mono text-xs"
                    value={form.formulas ?? ""}
                    onChange={(e) => set("formulas", e.target.value)}
                    placeholder={"E[X] = Σ x·p(x)\nVar(X) = E[X²] − (E[X])²"}
                  />
                </Field>
              </TabsContent>

              {topic && (
                <TabsContent value="history" className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Revised {revisions.length} time{revisions.length === 1 ? "" : "s"}</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setRevOpen(true)}>
                      <History /> Log revision
                    </Button>
                  </div>
                  {revisions.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No revisions logged yet.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {revisions.map((r) => (
                        <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                          <div>
                            <div className="tabular font-medium">{fmt(r.revised_on)}</div>
                            {r.notes && <div className="mt-0.5 text-xs text-muted-foreground">{r.notes}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <ConfidenceStars value={r.confidence_after} size="sm" />
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete revision" onClick={() => void remove("revision_records", [r.id])}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              )}
            </Tabs>

            <DialogFooter className="sm:justify-between">
              {topic ? (
                <Button type="button" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete topic
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">{topic ? "Save changes" : "Add topic"}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this topic?"
        description="Its revision history and check-in links are deleted too. Study sessions and tasks are kept but unlinked."
        onConfirm={async () => {
          if (topic) await remove("topics", [topic.id]);
          onOpenChange(false);
        }}
      />
      <RevisionDialog topic={liveTopic} open={revOpen} onOpenChange={setRevOpen} />
    </>
  );
}
