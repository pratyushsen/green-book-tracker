"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import type { Activity } from "@/lib/types";
import { ACTIVITY_LABELS } from "@/lib/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnumSelect, Field, TopicSelect, intOr } from "@/components/shared";

export const ACTIVITY_OPTIONS = (Object.keys(ACTIVITY_LABELS) as Activity[]).map((v) => ({ value: v, label: ACTIVITY_LABELS[v] }));

/** Log an additional study session (beyond the time recorded in the day's check-in). */
export function SessionDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTopicId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: string;
  defaultTopicId?: string | null;
}) {
  const { data, today, create, update } = useStore();
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState("45");
  const [activity, setActivity] = useState<Activity>("reading");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [problems, setProblems] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setDate(defaultDate ?? today);
      setMinutes("45");
      setActivity("reading");
      setTopicId(defaultTopicId ?? null);
      setProblems("0");
      setNotes("");
    }
  }, [open, defaultDate, defaultTopicId, today]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const m = intOr(minutes);
    if (m < 1 || m > 1440) return toast.error("Minutes must be between 1 and 1440");
    const topic = topicId ? data.topics.find((t) => t.id === topicId) : null;
    const [row] = await create("study_sessions", [
      {
        date,
        minutes: m,
        activity,
        problems_solved: Math.max(0, intOr(problems)),
        topic_id: topicId,
        chapter_id: topic?.chapter_id ?? null,
        check_in_id: null,
        notes: notes.trim() || null,
      },
    ]);
    if (row && topic) {
      const patch: Record<string, unknown> = {};
      if (!topic.last_studied_on || topic.last_studied_on < date) patch.last_studied_on = date;
      if (topic.status === "not_started") patch.status = "in_progress";
      if (Object.keys(patch).length) await update("topics", topic.id, patch);
    }
    if (row) toast.success("Session logged");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log study session</DialogTitle>
          <DialogDescription>Adds to the day&apos;s study time, alongside the time recorded in your check-in.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="ss-date">
              <Input id="ss-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Minutes" htmlFor="ss-min">
              <Input id="ss-min" type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
            </Field>
            <Field label="Activity">
              <EnumSelect value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} />
            </Field>
            <Field label="Problems solved" htmlFor="ss-prob">
              <Input id="ss-prob" type="number" min={0} value={problems} onChange={(e) => setProblems(e.target.value)} />
            </Field>
          </div>
          <Field label="Topic">
            <TopicSelect value={topicId} onChange={setTopicId} />
          </Field>
          <Field label="Notes" htmlFor="ss-notes">
            <Textarea id="ss-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Log session</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

