"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/data/store";
import { bookProgress, revisionCounts, type ChapterStat } from "@/lib/metrics";
import type { Difficulty, Topic, TopicStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ConfidenceStars,
  ConfirmDialog,
  DifficultyBadge,
  EmptyState,
  EnumSelect,
  PageHeader,
  STATUS_META,
  chapterLabel,
} from "@/components/shared";
import { ChapterDialog, TopicDialog } from "@/components/book/topic-dialogs";
import { ImportOutlineDialog } from "@/components/book/import-dialog";
import type { Chapter } from "@/lib/types";

type StatusFilter = "all" | TopicStatus | "revision";
type DiffFilter = "all" | Difficulty;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "revision", label: "On revision list" },
];
const DIFF_FILTERS: { value: DiffFilter; label: string }[] = [
  { value: "all", label: "All difficulties" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const STATUS_OPTIONS = (Object.keys(STATUS_META) as TopicStatus[]).map((v) => ({ value: v, label: STATUS_META[v].label }));

function QuickAddTopic({ chapterId }: { chapterId: string }) {
  const { data, create } = useStore();
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex items-center gap-2 px-3 py-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        const position = data.topics.filter((x) => x.chapter_id === chapterId).reduce((m, x) => Math.max(m, x.position), -1) + 1;
        await create("topics", [
          {
            chapter_id: chapterId,
            title: t,
            position,
            status: "not_started",
            difficulty: null,
            confidence: null,
            completed_on: null,
            last_studied_on: null,
            notes: null,
            formulas: null,
            in_revision_list: false,
          },
        ]);
        setTitle("");
      }}
    >
      <Plus className="size-4 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a topic and press Enter"
        className="h-8 border-transparent bg-transparent shadow-none focus-visible:border-input"
        aria-label="New topic title"
      />
    </form>
  );
}

function TopicRow({ topic, revisions, onOpen }: { topic: Topic; revisions: number; onOpen: () => void }) {
  const { update, setTopicStatus } = useStore();
  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors hover:bg-accent/40 md:grid-cols-[minmax(0,1fr)_130px_80px_100px_60px_90px_32px]">
      <button onClick={onOpen} className="min-w-0 cursor-pointer text-left">
        <div className={cn("truncate text-sm", topic.status === "completed" && "text-muted-foreground")}>{topic.title}</div>
        {(topic.notes || topic.formulas) && (
          <div className="truncate text-[11px] text-muted-foreground">{topic.formulas ? "∑ has formulas" : "has notes"}</div>
        )}
      </button>
      <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
        <EnumSelect size="sm" value={topic.status} options={STATUS_OPTIONS} onChange={(v) => void setTopicStatus(topic, v)} className="h-7 w-[124px]" />
      </div>
      <div className="flex items-center gap-3 md:contents">
        <div>
          <DifficultyBadge difficulty={topic.difficulty} />
        </div>
        <div>
          <ConfidenceStars value={topic.confidence} size="sm" onChange={(v) => void update("topics", topic.id, { confidence: v })} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="tabular text-xs text-muted-foreground">↻ {revisions}</div>
          </TooltipTrigger>
          <TooltipContent>Revised {revisions} times</TooltipContent>
        </Tooltip>
        <div className="tabular text-xs text-muted-foreground">{topic.completed_on ? fmt(topic.completed_on, "d MMM yy") : "—"}</div>
      </div>
      <div className="col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={topic.in_revision_list ? "Remove from revision list" : "Add to revision list"}
              onClick={() => void update("topics", topic.id, { in_revision_list: !topic.in_revision_list })}
            >
              {topic.in_revision_list ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4 text-muted-foreground" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{topic.in_revision_list ? "On revision list" : "Add to revision list"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function ChapterCard({
  stat,
  topics,
  index,
  count,
  counts,
  onEdit,
  onDelete,
  onOpenTopic,
  onAddTopic,
  onMove,
  defaultOpen,
}: {
  stat: ChapterStat;
  topics: Topic[];
  index: number;
  count: number;
  counts: Map<string, number>;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTopic: (t: Topic) => void;
  onAddTopic: () => void;
  onMove: (dir: -1 | 1) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = stat.total > 0 && stat.completed === stat.total;
  return (
    <div className="fade-up overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" aria-expanded={open}>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{chapterLabel(stat.chapter)}</span>
              {done && <Badge variant="success">Done</Badge>}
            </div>
            {stat.chapter.description && <p className="truncate text-xs text-muted-foreground">{stat.chapter.description}</p>}
          </div>
        </button>
        <div className="hidden w-48 items-center gap-3 sm:flex">
          <Progress value={stat.pct} className="h-1.5" />
          <span className="tabular w-16 text-right text-xs text-muted-foreground">
            {stat.completed}/{stat.total}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Chapter actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddTopic}>
              <Plus /> Add topic
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit chapter
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete chapter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div className="border-t border-border">
          {topics.length > 0 && (
            <div className="hidden grid-cols-[minmax(0,1fr)_130px_80px_100px_60px_90px_32px] gap-3 border-b border-border/60 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
              <span>Topic</span>
              <span>Status</span>
              <span>Difficulty</span>
              <span>Confidence</span>
              <span>Revised</span>
              <span>Completed</span>
              <span />
            </div>
          )}
          <div className="divide-y divide-border/60">
            {topics.map((t) => (
              <TopicRow key={t.id} topic={t} revisions={counts.get(t.id) ?? 0} onOpen={() => onOpenTopic(t)} />
            ))}
          </div>
          {topics.length === 0 && stat.total > 0 && <p className="px-4 py-3 text-xs text-muted-foreground">No topics match the filters.</p>}
          <div className="border-t border-border/60">
            <QuickAddTopic chapterId={stat.chapter.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookPage() {
  const { data, update, remove } = useStore();
  const progress = bookProgress(data);
  const counts = useMemo(() => revisionCounts(data), [data]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [diff, setDiff] = useState<DiffFilter>("all");
  const [chapterDialog, setChapterDialog] = useState<{ open: boolean; chapter: Chapter | null }>({ open: false, chapter: null });
  const [topicDialog, setTopicDialog] = useState<{ open: boolean; topic: Topic | null; chapterId: string | null }>({
    open: false,
    topic: null,
    chapterId: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<Chapter | null>(null);

  const filterTopic = (t: Topic) => {
    if (query && !t.title.toLowerCase().includes(query.toLowerCase()) && !(t.notes ?? "").toLowerCase().includes(query.toLowerCase())) return false;
    if (status === "revision" && !t.in_revision_list) return false;
    if (status !== "all" && status !== "revision" && t.status !== status) return false;
    if (diff !== "all" && t.difficulty !== diff) return false;
    return true;
  };
  const filtering = query !== "" || status !== "all" || diff !== "all";

  async function move(stat: ChapterStat, dir: -1 | 1) {
    const list = progress.chapters.map((c) => c.chapter);
    const i = list.findIndex((c) => c.id === stat.chapter.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const reordered = [...list];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await Promise.all(reordered.map((c, idx) => (c.position !== idx ? update("chapters", c.id, { position: idx }) : null)));
  }

  return (
    <>
      <PageHeader
        title="My Book"
        description={
          progress.total
            ? `${progress.completed} of ${progress.total} topics completed across ${progress.totalChapters} chapters · ${Math.round(progress.pct)}%`
            : "Build your chapter and topic structure from your own copy of the book."
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp /> Import outline
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.chapters.length}
              onClick={() => setTopicDialog({ open: true, topic: null, chapterId: null })}
            >
              <Plus /> Topic
            </Button>
            <Button size="sm" onClick={() => setChapterDialog({ open: true, chapter: null })}>
              <Plus /> Chapter
            </Button>
          </>
        }
      />

      {data.chapters.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Your book is empty"
          description="Add chapters and topics by hand, or paste the table of contents from your copy using Import outline. Nothing is pre-filled, so the structure is exactly what you enter."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp /> Import outline
              </Button>
              <Button onClick={() => setChapterDialog({ open: true, chapter: null })}>
                <Plus /> Add chapter
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics and notes…" className="pl-9" />
            </div>
            <EnumSelect value={status} options={STATUS_FILTERS} onChange={setStatus} className="sm:w-48" />
            <EnumSelect value={diff} options={DIFF_FILTERS} onChange={setDiff} className="sm:w-44" />
          </div>

          <div className="space-y-3">
            {progress.chapters.map((stat, i) => {
              const topics = stat.topics.filter(filterTopic);
              if (filtering && topics.length === 0) return null;
              return (
                <ChapterCard
                  key={stat.chapter.id}
                  stat={stat}
                  topics={topics}
                  index={i}
                  count={progress.chapters.length}
                  counts={counts}
                  defaultOpen={progress.chapters.length <= 4 || stat.inProgress > 0}
                  onEdit={() => setChapterDialog({ open: true, chapter: stat.chapter })}
                  onDelete={() => setDeleting(stat.chapter)}
                  onOpenTopic={(t) => setTopicDialog({ open: true, topic: t, chapterId: t.chapter_id })}
                  onAddTopic={() => setTopicDialog({ open: true, topic: null, chapterId: stat.chapter.id })}
                  onMove={(dir) => void move(stat, dir)}
                />
              );
            })}
          </div>
        </>
      )}

      <ChapterDialog open={chapterDialog.open} chapter={chapterDialog.chapter} onOpenChange={(o) => setChapterDialog((s) => ({ ...s, open: o }))} />
      <TopicDialog
        open={topicDialog.open}
        topic={topicDialog.topic}
        defaultChapterId={topicDialog.chapterId}
        onOpenChange={(o) => setTopicDialog((s) => ({ ...s, open: o }))}
      />
      <ImportOutlineDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description="All topics in this chapter and their revision history will be deleted. Study sessions and tasks are kept but unlinked."
        onConfirm={async () => {
          if (deleting) await remove("chapters", [deleting.id]);
        }}
      />
    </>
  );
}
