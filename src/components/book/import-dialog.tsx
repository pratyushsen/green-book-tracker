"use client";

import { useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import { parseOutline } from "@/lib/outline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const EXAMPLE = `# 1 | Chapter title from your copy
- First topic
- Second topic
# 2 | Next chapter
- Another topic`;

export function ImportOutlineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, create } = useStore();
  const [text, setText] = useState("");
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseOutline(text), [text]);
  const topicCount = parsed.chapters.reduce((a, c) => a + c.topics.length, 0);

  async function onFile(file: File) {
    setText(await file.text());
  }

  async function run() {
    if (!parsed.chapters.length) return;
    setBusy(true);
    let pos = data.chapters.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    let createdTopics = 0;
    for (const ch of parsed.chapters) {
      let chapter = merge ? data.chapters.find((c) => c.title.trim().toLowerCase() === ch.title.toLowerCase()) : undefined;
      if (!chapter) {
        [chapter] = await create("chapters", [{ number: ch.number, title: ch.title, description: null, position: pos++ }]);
        if (!chapter) break;
      }
      const existing = new Set(data.topics.filter((t) => t.chapter_id === chapter!.id).map((t) => t.title.toLowerCase()));
      let tpos = data.topics.filter((t) => t.chapter_id === chapter.id).reduce((m, t) => Math.max(m, t.position), -1) + 1;
      const rows = ch.topics
        .filter((t) => !(merge && existing.has(t.toLowerCase())))
        .map((title) => ({
          chapter_id: chapter!.id,
          title,
          position: tpos++,
          status: "not_started" as const,
          difficulty: null,
          confidence: null,
          completed_on: null,
          last_studied_on: null,
          notes: null,
          formulas: null,
          in_revision_list: false,
        }));
      createdTopics += (await create("topics", rows)).length;
    }
    setBusy(false);
    toast.success(`Imported ${parsed.chapters.length} chapters and ${createdTopics} topics`);
    setText("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import book outline</DialogTitle>
          <DialogDescription>
            Paste your own chapter/topic structure. Lines starting with <code>#</code> are chapters (optional{" "}
            <code>number |</code> prefix); lines starting with <code>-</code> or indented are topics. JSON{" "}
            <code>{`[{"number":"1","title":"…","topics":["…"]}]`}</code> also works.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="font-mono text-xs" placeholder={EXAMPLE} />
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <FileUp className="size-4" />
            <span className="underline underline-offset-2">Load from .txt / .md / .json file</span>
            <input
              type="file"
              accept=".txt,.md,.json,text/plain,application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
            />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            <Switch checked={merge} onCheckedChange={setMerge} />
            Merge into chapters with the same title & skip duplicate topics
          </label>
        </div>
        {(parsed.chapters.length > 0 || parsed.errors.length > 0) && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <p>
              Preview: <span className="font-medium text-foreground">{parsed.chapters.length}</span> chapters,{" "}
              <span className="font-medium text-foreground">{topicCount}</span> topics
            </p>
            {parsed.errors.map((e) => (
              <p key={e} className="mt-1 text-amber-400">
                {e}
              </p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!parsed.chapters.length || busy} onClick={() => void run()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
