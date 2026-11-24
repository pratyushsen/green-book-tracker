"use client";

/**
 * LEGACY localStorage data (read-only).
 *
 * Earlier versions of the app stored everything in this browser under keys
 * prefixed "gbt:v1:". The app now stores all study data in Supabase; this
 * module only reads that old data so it can be imported (see local-import.ts).
 * Nothing here writes study data to localStorage any more.
 *
 * Local data is removed only when the user explicitly asks AND an import of
 * exactly this data has been verified against Supabase.
 */
import { emptySnapshot } from "./backend";
import { TABLES, type DataSnapshot, type Profile, type TableName } from "@/lib/types";

export const LEGACY_PREFIX = "gbt:v1:";
const RECORD_KEY = LEGACY_PREFIX + "import-record";

export interface LegacySnapshot {
  profile: Profile | null;
  data: DataSnapshot;
  /** rows excluding reminders (which every install has by default) */
  studyRows: number;
}

export interface ImportRecord {
  fingerprint: string;
  userId: string;
  email: string | null;
  importedAt: string;
  verified: true;
  rowCounts: Record<string, number>;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Returns legacy data if this browser has any study data stored locally. */
export function readLegacySnapshot(): LegacySnapshot | null {
  if (typeof window === "undefined") return null;
  const data = emptySnapshot();
  let studyRows = 0;
  for (const t of TABLES) {
    const rows = parse<unknown[]>(safeGet(LEGACY_PREFIX + t), []);
    (data as Record<TableName, unknown[]>)[t] = Array.isArray(rows) ? rows : [];
    if (t !== "reminders") studyRows += (data as Record<TableName, unknown[]>)[t].length;
  }
  const profile = parse<Profile | null>(safeGet(LEGACY_PREFIX + "profile"), null);
  if (studyRows === 0) return null;
  return { profile, data, studyRows };
}

/** Stable SHA-256 fingerprint of a snapshot, used to make imports idempotent. */
export async function fingerprintSnapshot(snapshot: { profile: Profile | null; data: DataSnapshot }): Promise<string> {
  const ordered = TABLES.map((t) => [t, [...snapshot.data[t]].sort((a, b) => String(a.id).localeCompare(String(b.id)))]);
  const text = JSON.stringify({ tables: ordered, profile: snapshot.profile });
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getImportRecord(): ImportRecord | null {
  if (typeof window === "undefined") return null;
  return parse<ImportRecord | null>(safeGet(RECORD_KEY), null);
}

export function saveImportRecord(record: ImportRecord) {
  window.localStorage.setItem(RECORD_KEY, JSON.stringify(record));
}

/**
 * Removes the legacy study data from this browser. Refuses unless the current
 * local data matches a verified import into the signed-in account.
 */
export async function clearLegacyDataAfterVerifiedImport(userId: string): Promise<void> {
  const snapshot = readLegacySnapshot();
  const record = getImportRecord();
  if (!snapshot) return;
  if (!record || !record.verified || record.userId !== userId) {
    throw new Error("Local data hasn't been imported and verified for this account yet, so it was not removed.");
  }
  if ((await fingerprintSnapshot(snapshot)) !== record.fingerprint) {
    throw new Error("Local data changed since it was imported, so it was not removed. Import it again first.");
  }
  for (const t of TABLES) window.localStorage.removeItem(LEGACY_PREFIX + t);
  window.localStorage.removeItem(LEGACY_PREFIX + "profile");
}
