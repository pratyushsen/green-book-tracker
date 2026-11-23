"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Priority, StudyTask, TaskStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChapterSelect, EnumSelect, Field, PRIORITY_META, TASK_STATUS_LABEL, TopicSelect, intOr } from "@/components/shared";

const PRIORITY_OPTIONS = (Object.keys(PRIORITY_META) as Priority[]).map((v) => ({ value: v, label: PRIORITY_META[v].label }));
const STATUS_OPTIONS = (Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((v) => ({ value: v, label: TASK_STATUS_LABEL[v] }));

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: StudyTask | null;
  defaultDate?: string | null;
}) {
  const { data, create, update, remove } = useStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [planned, setPlanned] = useState("60");

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setTopicId(task?.topic_id ?? null);
    setChapterId(task?.chapter_id ?? null);
    setScheduled(task?.scheduled_date ?? defaultDate ?? "");
    setDeadline(task?.deadline ?? "");
    setPriority(task?.priority ?? "medium");
    setStatus(task?.status ?? "todo");
    setPlanned(String(task?.planned_minutes ?? 60));
  }, [open, task, defaultDate]);

  function pickTopic(id: string | null) {
    setTopicId(id);
    const t = id ? data.topics.find((x) => x.id === id) : null;
    if (t) {
      setChapterId(t.chapter_id);
      if (!title.trim()) setTitle(`Study: ${t.title}`);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (deadline && scheduled && deadline < scheduled) toast.warning("Deadline is before the scheduled date");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      topic_id: topicId,
      chapter_id: chapterId,
      scheduled_date: scheduled || null,
      deadline: deadline || null,
      priority,
      status,
      planned_minutes: Math.min(1440, Math.max(0, intOr(planned))),
      completed_at: status === "done" ? (task?.completed_at ?? new Date().toISOString()) : null,
    };
    if (task) {
      const moved = task.scheduled_date && payload.scheduled_date && task.scheduled_date !== payload.scheduled_date;
      await update("study_tasks", task.id, { ...payload, rescheduled_count: task.rescheduled_count + (moved ? 1 : 0) });
    } else await create("study_tasks", [{ ...payload, rescheduled_count: 0 }]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New study task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <Field label="Linked topic (optional)">
            <TopicSelect value={topicId} onChange={pickTopic} />
          </Field>
          <Field label="Title" htmlFor="tk-title">
            <Input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Finish chapter problems 1–10" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chapter">
              <ChapterSelect value={chapterId} onChange={setChapterId} />
            </Field>
            <Field label="Planned minutes" htmlFor="tk-plan">
              <Input id="tk-plan" type="number" min={0} max={1440} step={5} value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </Field>
            <Field label="Scheduled for" htmlFor="tk-date">
              <Input id="tk-date" type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
            </Field>
            <Field label="Deadline" htmlFor="tk-deadline">
              <Input id="tk-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Priority">
              <EnumSelect value={priority} options={PRIORITY_OPTIONS} onChange={setPriority} />
            </Field>
            <Field label="Status">
              <EnumSelect value={status} options={STATUS_OPTIONS} onChange={setStatus} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="tk-desc">
            <Textarea id="tk-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {task && task.rescheduled_count > 0 && <p className="text-xs text-muted-foreground">Rescheduled {task.rescheduled_count} time(s).</p>}
          <DialogFooter className="sm:justify-between">
            {task ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={async () => {
                  await remove("study_tasks", [task.id]);
                  onOpenChange(false);
                }}
              >
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{task ? "Save" : "Create task"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
