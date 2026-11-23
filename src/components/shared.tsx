"use client";

import * as React from "react";
import { Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Difficulty, Priority, TaskStatus, TopicStatus } from "@/lib/types";
import { useStore } from "@/lib/data/store";
import { sortChapters, sortTopics } from "@/lib/metrics";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  className,
  children,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fade-up rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/25",
        accent && "card-glow",
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {Icon && <Icon className="size-4 text-primary/80" />}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center", className)}>
      <div className="mb-3 rounded-full bg-primary/10 p-3">
        <Icon className="size-5 text-primary" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfidenceStars({
  value,
  onChange,
  size = "md",
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(null)} aria-label={`Confidence ${value ?? "not set"} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`Set confidence ${n}`}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={() => onChange?.(value === n ? null : n)}
          className={cn("p-0.5 transition-transform", onChange && "cursor-pointer hover:scale-110", !onChange && "cursor-default")}
        >
          <Star
            className={cn(
              size === "sm" ? "size-3" : "size-4",
              n <= shown ? "fill-amber-400/90 text-amber-400/90" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export const STATUS_META: Record<TopicStatus, { label: string; variant: "outline" | "warning" | "success" }> = {
  not_started: { label: "Not started", variant: "outline" },
  in_progress: { label: "In progress", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
};

export function StatusBadge({ status }: { status: TopicStatus }) {
  const m = STATUS_META[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export const DIFFICULTY_META: Record<Difficulty, { label: string; variant: "success" | "warning" | "danger" }> = {
  easy: { label: "Easy", variant: "success" },
  medium: { label: "Medium", variant: "warning" },
  hard: { label: "Hard", variant: "danger" },
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty | null }) {
  if (!difficulty) return <span className="text-xs text-muted-foreground">—</span>;
  const m = DIFFICULTY_META[difficulty];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export const PRIORITY_META: Record<Priority, { label: string; variant: "outline" | "info" | "warning" | "danger"; rank: number }> = {
  low: { label: "Low", variant: "outline", rank: 0 },
  medium: { label: "Medium", variant: "info", rank: 1 },
  high: { label: "High", variant: "warning", rank: 2 },
  urgent: { label: "Urgent", variant: "danger", rank: 3 },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  skipped: "Skipped",
};

const NONE = "__none__";

/** Grouped chapter → topic picker. value is a topic id or null. */
export function TopicSelect({
  value,
  onChange,
  placeholder = "No linked topic",
  allowNone = true,
  id,
}: {
  value: string | null;
  onChange: (topicId: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  id?: string;
}) {
  const { data } = useStore();
  const chapters = sortChapters(data.chapters);
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {allowNone && <SelectItem value={NONE}>{placeholder}</SelectItem>}
        {chapters.map((c) => {
          const topics = sortTopics(data.topics.filter((t) => t.chapter_id === c.id));
          if (!topics.length) return null;
          return (
            <SelectGroup key={c.id}>
              <SelectLabel>{chapterLabel(c)}</SelectLabel>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function ChapterSelect({
  value,
  onChange,
  placeholder = "No chapter",
  id,
}: {
  value: string | null;
  onChange: (chapterId: string | null) => void;
  placeholder?: string;
  id?: string;
}) {
  const { data } = useStore();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {sortChapters(data.chapters).map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {chapterLabel(c)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function chapterLabel(c: { number: string | null; title: string }) {
  return c.number ? `${c.number}. ${c.title}` : c.title;
}

/** Simple enum select. */
export function EnumSelect<T extends string>({
  value,
  onChange,
  options,
  id,
  size,
  className,
  placeholder,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  id?: string;
  size?: "sm" | "default";
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select value={value ?? undefined} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} size={size} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProgressRing({
  value,
  size = 140,
  stroke = 10,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export const intOr = (s: string, fallback = 0) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};
