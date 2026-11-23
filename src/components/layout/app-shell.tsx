"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarRange,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings,
  Sun,
  MessageSquareText,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/data/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { ReminderEngine } from "./reminder-engine";
import { currentAlerts } from "@/lib/reminders";
import { clockIn, fmt } from "@/lib/dates";
import { bookProgress, streaks } from "@/lib/metrics";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/book", label: "My Book", icon: BookOpen },
  { href: "/planner", label: "Study Planner", icon: CalendarRange },
  { href: "/check-ins", label: "Daily Check-ins", icon: CalendarCheck2 },
  { href: "/revision", label: "Revision", icon: RotateCcw },
  { href: "/questions", label: "Question Bank", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className="size-7" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">Green Book</div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Tracker</div>
      </div>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, today } = useStore();
  const progress = bookProgress(data);
  const { current } = streaks(data, today);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-border/60 px-3">
        <Brand />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {label}
              {active && <span className="ml-auto h-4 w-0.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted-foreground">Book progress</span>
          <span className="tabular text-xs font-semibold text-primary">{Math.round(progress.pct)}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {progress.completed}/{progress.total} topics · {current}-day streak
        </div>
      </div>
    </div>
  );
}

function AlertsBell() {
  const { data, profile, today } = useStore();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const alerts = currentAlerts(data.reminders, data, profile, today, clockIn(profile.timezone));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`In-app reminders (${alerts.length})`} className="relative">
          <Bell className="size-4" />
          {alerts.length > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {alerts.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>In-app reminders</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">Nothing needs your attention right now.</div>
        ) : (
          alerts.map((a) => (
            <DropdownMenuItem key={a.type} asChild>
              <Link href={a.href} className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium text-foreground">{a.title}</span>
                <span className="text-xs text-muted-foreground">{a.body}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#reminders" className="text-xs">
            Configure reminders
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeBadge() {
  const { mode } = useStore();
  const local = mode === "local";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex",
            local ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          {local ? <HardDrive className="size-3" /> : <Database className="size-3" />}
          {local ? "Local mode" : "Synced to Supabase"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {local
          ? "Supabase is not configured. Data is stored only in this browser's localStorage — it is not backed up or synced."
          : "Data is stored in your Supabase database and protected by Row Level Security."}
      </TooltipContent>
    </Tooltip>
  );
}

function UserMenu() {
  const { mode, userEmail, profile, signOut } = useStore();
  const { theme, setTheme } = useTheme();
  const name = profile.display_name || userEmail || "Local user";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {name.slice(0, 1).toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun /> : <Moon />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        {mode === "supabase" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, error, reload, today, mode } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (status === "signed_out") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border/60 bg-sidebar lg:block">
        <SidebarNav />
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <div className="text-xs text-muted-foreground tabular">{fmt(today, "EEEE, d MMMM yyyy")}</div>
          <div className="ml-auto flex items-center gap-1.5">
            <ModeBadge />
            <AlertsBell />
            <UserMenu />
          </div>
        </header>

        {mode === "local" && status === "ready" && (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-center text-[11px] text-amber-300/90 sm:px-6">
            Local development mode — data is saved only in this browser, not in Supabase. Configure Supabase to persist and sync it.
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {status === "loading" && <LoadingState />}
          {status === "error" && (
            <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm">
              <div className="flex items-center gap-2 font-medium text-red-300">
                <AlertTriangle className="size-4" /> Couldn&apos;t load your data
              </div>
              <p className="mt-2 text-muted-foreground">{error}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                If you just configured Supabase, make sure the migration in <code>supabase/migrations</code> has been run.
              </p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => void reload()}>
                <RefreshCw /> Retry
              </Button>
            </div>
          )}
          {status === "ready" && children}
        </main>
      </div>
      {status === "ready" && <ReminderEngine />}
    </div>
  );
}
