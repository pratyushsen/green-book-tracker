"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CloudUpload, HardDrive, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/data/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  clearLegacyDataAfterVerifiedImport,
  fingerprintSnapshot,
  getImportRecord,
  readLegacySnapshot,
  saveImportRecord,
  type ImportRecord,
  type LegacySnapshot,
} from "@/lib/data/local-backend";
import { planImport, runImport, verifyImport } from "@/lib/data/local-import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared";

type Phase = "idle" | "importing" | "verifying" | "done";

/** Detects study data left in this browser's localStorage and safely imports it into Supabase. */
export function useLegacyData() {
  const { userId } = useStore();
  const [snapshot, setSnapshot] = useState<LegacySnapshot | null>(null);
  const [record, setRecord] = useState<ImportRecord | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  const refresh = async () => {
    const snap = readLegacySnapshot();
    setSnapshot(snap);
    setRecord(getImportRecord());
    setFingerprint(snap ? await fingerprintSnapshot(snap) : null);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const importedHere = Boolean(snapshot && record?.verified && record.userId === userId && record.fingerprint === fingerprint);
  return { snapshot, record, fingerprint, importedHere, refresh };
}

export function LegacyImportBanner() {
  const { snapshot, importedHere } = useLegacyData();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(window.sessionStorage.getItem("gbt:hide-import-banner") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  if (!snapshot || importedHere || hidden) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-[11px] text-primary sm:px-6">
      <HardDrive className="size-3" />
      <span>
        This browser has {snapshot.studyRows} study records saved locally from before you signed in.
      </span>
      <Link href="/settings#import" className="font-medium underline underline-offset-2">
        Review &amp; import
      </Link>
      <button
        aria-label="Hide for this session"
        className="ml-1 opacity-70 hover:opacity-100"
        onClick={() => {
          setHidden(true);
          try {
            window.sessionStorage.setItem("gbt:hide-import-banner", "1");
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function LegacyImportPanel() {
  const { data, userId, userEmail, reload } = useStore();
  const { snapshot, record, fingerprint, importedHere, refresh } = useLegacyData();
  const cloudIsEmpty = useMemo(() => data.chapters.length === 0 && data.check_ins.length === 0 && data.study_sessions.length === 0, [data]);
  const [applySettings, setApplySettings] = useState<boolean | null>(null);
  const apply = applySettings ?? cloudIsEmpty;
  const [phase, setPhase] = useState<Phase>("idle");
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const plan = useMemo(
    () => (snapshot ? planImport(snapshot, data, apply) : null),
    [snapshot, data, apply],
  );

  if (!snapshot || !plan) return null;

  async function doImport() {
    if (!snapshot || !plan || !fingerprint || !userId) return;
    setProblems([]);
    setPhase("importing");
    try {
      const sb = getSupabaseBrowserClient();
      const res = await runImport(sb, plan, fingerprint, "local_storage", apply);
      let rowCounts = res.rowCounts;
      if (!res.alreadyImported) {
        setPhase("verifying");
        const v = await verifyImport(sb, plan);
        if (!v.ok) {
          setProblems(v.problems);
          setPhase("idle");
          toast.error("Import could not be verified. Your local data has been kept.");
          return;
        }
      } else {
        rowCounts = res.rowCounts;
      }
      // The import transaction committed (and, for a fresh import, every row was read back).
      saveImportRecord({
        fingerprint,
        userId,
        email: userEmail,
        importedAt: new Date().toISOString(),
        verified: true,
        rowCounts,
      });
      await reload();
      await refresh();
      setPhase("done");
      toast.success(
        res.alreadyImported
          ? "This data was already imported into your account — nothing was duplicated."
          : `Imported and verified ${plan.total} records. Your local copy is kept as a backup.`,
      );
    } catch (e) {
      setPhase("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setProblems([msg]);
      toast.error(`${msg} Nothing was imported; your local data is untouched.`);
    }
  }

  const busy = phase === "importing" || phase === "verifying";

  return (
    <div id="import" className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-start gap-3">
        {importedHere ? <CheckCircle2 className="mt-0.5 size-4 text-primary" /> : <CloudUpload className="mt-0.5 size-4 text-primary" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {importedHere ? "Local data imported and verified" : "Study data found in this browser"}
          </div>
          <p className="text-xs text-muted-foreground">
            {importedHere
              ? `Imported into ${record?.email ?? "your account"} on ${new Date(record!.importedAt).toLocaleString()}. The local copy is still in this browser as a backup — you can remove it whenever you like.`
              : "Saved before Supabase was set up. Import it into your account so it's backed up and synced. Nothing in this browser is deleted."}
          </p>
        </div>
      </div>

      {!importedHere && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(plan.counts).map(([t, n]) => (
              <Badge key={t} variant="outline">
                {t.replace(/_/g, " ")}: {n}
              </Badge>
            ))}
          </div>
          {plan.skipped.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-300/90">
              {plan.skipped.map((s) => (
                <li key={s}>Will skip {s}.</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="apply-settings" checked={apply} onCheckedChange={(v) => setApplySettings(v === true)} disabled={busy} />
            <Label htmlFor="apply-settings" className="text-xs font-normal">
              Also use my local settings (targets, timezone, reminders){cloudIsEmpty ? "" : " — replaces your current settings"}
            </Label>
          </div>
        </>
      )}

      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md border border-red-500/30 bg-red-500/5 p-2 pl-6 text-xs text-red-300">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {!importedHere && (
          <Button size="sm" onClick={() => void doImport()} disabled={busy || plan.total === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            {phase === "importing" ? "Importing…" : phase === "verifying" ? "Verifying…" : `Import ${plan.total} records`}
          </Button>
        )}
        {importedHere && (
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setConfirmClear(true)}>
            Remove local copy
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Remove the local copy?"
        description="Your data is safely in your Supabase account (verified). This only removes the old copy stored in this browser and can't be undone."
        confirmLabel="Remove local copy"
        onConfirm={async () => {
          try {
            await clearLegacyDataAfterVerifiedImport(userId ?? "");
            await refresh();
            toast.success("Local copy removed from this browser");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </div>
  );
}
