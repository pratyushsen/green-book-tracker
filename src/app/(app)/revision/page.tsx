"use client";

import { useMemo, useState } from "react";
import { BookmarkCheck, BookmarkPlus, Brain, Clock3, FlaskConical, History, RotateCcw, Search, Sigma, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/data/store";
import type { Topic } from "@/lib/types";
import { revisionBuckets, revisionCounts } from "@/lib/metrics";
import { fmt } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfidenceStars, DifficultyBadge, EmptyState, PageHeader, StatCard, StatusBadge, chapterLabel } from "@/components/shared";
import { RevisionDialog, TopicDialog } from "@/components/book/topic-dialogs";

function TopicTable({
  topics,
  emptyTitle,
  emptyDescription,
  onRevise,
  onOpen,
  sinceLabel,
}: {
  topics: Topic[];
  emptyTitle: string;
  emptyDescription?: string;
  onRevise: (t: Topic) => void;
  onOpen: (t: Topic) => void;
  sinceLabel: (t: Topic) => string;
}) {
  const { data, update } = useStore();
  const chapters = useMemo(() => new Map(data.chapters.map((c) => [c.id, c])), [data.chapters]);
  const counts = useMemo(() => revisionCounts(data), [data]);
  if (!topics.length) return <EmptyState icon={RotateCcw} title={emptyTitle} description={emptyDescription} />;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_100px_70px_120px_150px] gap-3 border-b border-border px-4 py-2.5 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
          <span>Topic</span>
          <span>Status</span>
          <span>Confidence</span>
          <span>Revised</span>
          <span>Last touched</span>
          <span />
        </div>
        <ul className="divide-y divide-border/60">
          {topics.map((t) => {
            const ch = chapters.get(t.chapter_id);
            return (
              <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_110px_100px_70px_120px_150px]">
                <button onClick={() => onOpen(t)} className="min-w-0 cursor-pointer text-left">
                  <div className="truncate text-sm">{t.title}</div>
                  <div className="flex items-center gap-2 truncate text-[11px] text-muted-foreground">
                    {ch ? chapterLabel(ch) : ""} <DifficultyBadge difficulty={t.difficulty} />
                  </div>
                </button>
                <div className="hidden md:block">
                  <StatusBadge status={t.status} />
                </div>
                <div className="hidden md:block">
                  <ConfidenceStars value={t.confidence} size="sm" onChange={(v) => void update("topics", t.id, { confidence: v })} />
                </div>
                <div className="tabular hidden text-xs text-muted-foreground md:block">{counts.get(t.id) ?? 0}×</div>
                <div className="hidden text-xs text-muted-foreground md:block">{sinceLabel(t)}</div>
                <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.in_revision_list ? "Remove from revision list" : "Add to revision list"}
                        onClick={() => void update("topics", t.id, { in_revision_list: !t.in_revision_list })}
                      >
                        {t.in_revision_list ? <BookmarkCheck className="size-4 text-primary" /> : <BookmarkPlus className="size-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.in_revision_list ? "On revision list" : "Add to revision list"}</TooltipContent>
                  </Tooltip>
                  <Button size="sm" variant="outline" onClick={() => onRevise(t)}>
                    <History /> Revised
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function FormulaSheet({ topics, onOpen }: { topics: Topic[]; onOpen: (t: Topic) => void }) {
  const { data } = useStore();
  const [q, setQ] = useState("");
  const chapters = new Map(data.chapters.map((c) => [c.id, c]));
  const filtered = topics.filter((t) => !q || [t.title, t.formulas, t.notes].some((x) => (x ?? "").toLowerCase().includes(q.toLowerCase())));
  if (!topics.length)
    return (
      <EmptyState
        icon={Sigma}
        title="No formulas or concepts yet"
        description="Add important formulas and notes to topics in My Book. They're collected here as a revision sheet."
      />
    );
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search formulas and notes…" className="pl-9" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {filtered.map((t) => {
          const ch = chapters.get(t.chapter_id);
          return (
            <button key={t.id} onClick={() => onOpen(t)} className="fade-up cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40">
              <div className="text-[11px] text-muted-foreground">{ch ? chapterLabel(ch) : ""}</div>
              <div className="mt-0.5 text-sm font-medium">{t.title}</div>
              {t.formulas && (
                <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-background/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-primary/90">
                  {t.formulas}
                </pre>
              )}
              {t.notes && <p className="mt-3 line-clamp-4 text-xs whitespace-pre-wrap text-muted-foreground">{t.notes}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function RevisionPage() {
  const { data, profile, today } = useStore();
  const b = useMemo(() => revisionBuckets(data, profile, today), [data, profile, today]);
  const [revising, setRevising] = useState<Topic | null>(null);
  const [opened, setOpened] = useState<Topic | null>(null);
  const totalRevisions = data.revision_records.length;
  const sinceLabel = (t: Topic) => {
    const d = b.touched.get(t.id);
    if (!d) return "never";
    const n = b.since(t) ?? 0;
    return n === 0 ? "today" : `${n}d ago · ${fmt(d, "d MMM")}`;
  };
  const bySince = (a: Topic, c: Topic) => (b.since(c) ?? 9999) - (b.since(a) ?? 9999);
  const common = { onRevise: setRevising, onOpen: setOpened, sinceLabel };

  return (
    <>
      <PageHeader
        title="Revision"
        description={`Topics on your revision list come due ${profile.revision_interval_days} days after you last touched them; topics untouched for ${profile.stale_after_days}+ days are flagged. Adjust both in Settings.`}
      />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Due for revision" value={b.due.length} icon={Clock3} accent={b.due.length > 0} />
        <StatCard label="Low confidence (≤2)" value={b.lowConfidence.length} icon={TriangleAlert} />
        <StatCard label="Not studied lately" value={b.stale.length} icon={Brain} />
        <StatCard label="Revisions logged" value={totalRevisions} icon={FlaskConical} />
      </div>
      <Tabs defaultValue="due">
        <TabsList>
          <TabsTrigger value="due">Due ({b.due.length})</TabsTrigger>
          <TabsTrigger value="list">Revision list ({b.revisionList.length})</TabsTrigger>
          <TabsTrigger value="low">Low confidence ({b.lowConfidence.length})</TabsTrigger>
          <TabsTrigger value="stale">Not studied lately ({b.stale.length})</TabsTrigger>
          <TabsTrigger value="formulas">Formulas & concepts</TabsTrigger>
        </TabsList>
        <TabsContent value="due">
          <TopicTable
            topics={[...b.due].sort(bySince)}
            emptyTitle="Nothing due right now"
            emptyDescription="Add topics to your revision list from My Book (bookmark icon) or from the other tabs here."
            {...common}
          />
        </TabsContent>
        <TabsContent value="list">
          <TopicTable topics={[...b.revisionList].sort(bySince)} emptyTitle="Your revision list is empty" {...common} />
        </TabsContent>
        <TabsContent value="low">
          <TopicTable
            topics={[...b.lowConfidence].sort((a, c) => (a.confidence ?? 0) - (c.confidence ?? 0))}
            emptyTitle="No low-confidence topics"
            emptyDescription="Rate topics 1–5 in My Book; anything rated 1 or 2 shows up here."
            {...common}
          />
        </TabsContent>
        <TabsContent value="stale">
          <TopicTable topics={[...b.stale].sort(bySince)} emptyTitle="Everything you've started is fresh" {...common} />
        </TabsContent>
        <TabsContent value="formulas">
          <FormulaSheet topics={b.withFormulas} onOpen={setOpened} />
        </TabsContent>
      </Tabs>
      <RevisionDialog topic={revising} open={!!revising} onOpenChange={(o) => !o && setRevising(null)} />
      <TopicDialog topic={opened} open={!!opened} onOpenChange={(o) => !o && setOpened(null)} />
    </>
  );
}
