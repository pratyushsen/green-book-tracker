// Verifies the Supabase migration in an in-memory Postgres (PGlite):
// RLS isolation between users, cross-user foreign keys, cascades and checks.
// Run with: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
process.on("unhandledRejection", e => { console.log("ERR", e.message, e.position); process.exit(1); });
const q = (s, p) => db.query(s, p);
await db.exec(`
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`);
const migDir = new URL("../supabase/migrations/", import.meta.url);
for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(fs.readFileSync(new URL(f, migDir), "utf8"));
  console.log("applied", f);
}
// No blanket grants here: access must come from the migrations themselves
// (Supabase projects created after 30 May 2026 don't grant tables to API roles automatically).
await db.exec(`revoke all on all tables in schema public from authenticated, anon;`);
await db.exec(`revoke execute on all functions in schema public from public;`);
for (const f of fs.readdirSync(migDir).filter((f) => f.includes("grants"))) await db.exec(fs.readFileSync(new URL(f, migDir), "utf8"));
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
await q(`insert into auth.users (id,email) values ($1,'a@x.com'),($2,'b@x.com')`, [A, B]);
console.log("profiles", (await q("select id, display_name, timezone from public.profiles")).rows.length,
  "reminders", (await q("select count(*) from public.reminders")).rows[0]);
async function as(uid, fn) { await db.exec(`set role authenticated; select set_config('request.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec("reset role;"); } }
const ch = await as(A, () => q(`insert into chapters (user_id,title,position) values ($1,'Ch A',0) returning id`, [A]));
const chId = ch.rows[0].id;
const tp = await as(A, () => q(`insert into topics (user_id,chapter_id,title) values ($1,$2,'T1') returning id`, [A, chId]));
const tId = tp.rows[0].id;
await as(A, () => q(`insert into study_sessions (user_id,date,minutes,topic_id,chapter_id) values ($1,'2026-11-20',30,$2,$3)`, [A, tId, chId]));
await as(A, () => q(`insert into revision_records (user_id,topic_id,revised_on) values ($1,$2,'2026-11-21')`, [A, tId]));
console.log("B sees chapters:", (await as(B, () => q("select * from chapters"))).rows.length);
console.log("A sees chapters:", (await as(A, () => q("select * from chapters"))).rows.length);
try { await as(B, () => q(`insert into chapters (user_id,title) values ($1,'hack')`, [A])); console.log("FAIL: B inserted as A"); } catch (e) { console.log("OK blocked insert:", e.message); }
try { await as(B, () => q(`insert into topics (user_id,chapter_id,title) values ($1,$2,'x')`, [B, chId])); console.log("FAIL: cross-user FK"); } catch (e) { console.log("OK cross-user FK blocked:", e.message.slice(0,80)); }
const upd = await as(B, () => q(`update chapters set title='pwn' where id=$1`, [chId]));
console.log("B update affected:", upd.affectedRows);
// delete topic -> session topic_id null, revision cascade
await as(A, () => q(`delete from topics where id=$1`, [tId]));
console.log("session after topic delete:", (await as(A, () => q("select topic_id, chapter_id, user_id from study_sessions"))).rows);
console.log("revisions after:", (await as(A, () => q("select count(*) from revision_records"))).rows[0]);
await as(A, () => q(`delete from chapters where id=$1`, [chId]));
console.log("session after chapter delete:", (await as(A, () => q("select topic_id, chapter_id from study_sessions"))).rows);
// check-in unique
await as(A, () => q(`insert into check_ins (user_id,date) values ($1,'2026-11-22')`, [A]));
try { await as(A, () => q(`insert into check_ins (user_id,date) values ($1,'2026-11-22')`, [A])); } catch (e) { console.log("OK unique checkin:", e.message.slice(0,60)); }
try { await as(A, () => q(`update reminders set time_of_day='25:00' where user_id=$1`, [A])); } catch (e) { console.log("OK time check:", e.message.slice(0,60)); }

// ---------------------------------------------------------------------------
// import_local_snapshot: atomic, idempotent, always owned by the caller
// ---------------------------------------------------------------------------
let failures = 0;
const check = (cond, msg) => { console.log(cond ? "OK  " : "FAIL", msg); if (!cond) failures++; };
const uuid = () => crypto.randomUUID();
const c1 = uuid(), t1 = uuid(), ci = uuid(), q1 = uuid();
const payload = {
  chapters: [{ id: c1, user_id: B /* spoof attempt: must be ignored */, title: "Imported ch", position: 1, number: "1" }],
  topics: [{ id: t1, chapter_id: c1, title: "Imported topic", status: "completed", confidence: 4, in_revision_list: true }],
  check_ins: [{ id: ci, date: "2026-10-01", minutes: 45, problems_solved: 3, learned: "x" }],
  check_in_topics: [{ id: uuid(), check_in_id: ci, topic_id: t1 }],
  study_sessions: [{ id: uuid(), date: "2026-10-01", minutes: 45, activity: "problems", check_in_id: ci, topic_id: t1, chapter_id: c1 }],
  study_tasks: [{ id: uuid(), title: "Task", topic_id: t1, chapter_id: c1, priority: "high", status: "done", planned_minutes: 30, rescheduled_count: 1, completed_at: "2026-10-01T10:00:00Z" }],
  daily_targets: [{ id: uuid(), date: "2026-10-01", target_minutes: 60, target_problems: 2 }],
  weekly_goals: [{ id: uuid(), week_start: "2026-09-28", target_minutes: 300, target_topics: 3 }],
  revision_records: [{ id: uuid(), topic_id: t1, revised_on: "2026-10-02", confidence_after: 5 }],
  interview_questions: [{ id: q1, title: "Q", tags: ["prob", "brainteaser"], topic_id: t1, starred: true }],
  question_attempts: [{ id: uuid(), question_id: q1, attempted_on: "2026-10-03", correct: false, mistake: "m" }],
  reminders: [{ type: "daily_checkin", enabled: false, time_of_day: "22:30", days_of_week: [1, 2, 3], browser_notification: true, lead_days: 3 }],
  profile: { daily_target_minutes: 90, timezone: "Asia/Kolkata" },
};
const imp = (uid, fp, data, apply = true) =>
  as(uid, () => q(`select public.import_local_snapshot($1, 'local_storage', $2::jsonb, $3) as r`, [fp, JSON.stringify(data), apply]));

const r1 = (await imp(A, "fingerprint-aaaaaaaa-1", payload)).rows[0].r;
check(r1.already_imported === false && r1.row_counts.chapters === 1 && r1.row_counts.question_attempts === 1, "import inserts every table: " + JSON.stringify(r1.row_counts));
const owner = (await as(A, () => q(`select user_id from chapters where id=$1`, [c1]))).rows[0];
check(owner && owner.user_id === A, "imported rows are owned by the caller even if payload says otherwise");
const tags = (await as(A, () => q(`select tags from interview_questions where id=$1`, [q1]))).rows[0].tags;
check(JSON.stringify(tags) === '["prob","brainteaser"]', "text[] tags imported");
const rem = (await as(A, () => q(`select enabled, time_of_day, days_of_week, lead_days from reminders where user_id=$1 and type='daily_checkin'`, [A]))).rows;
check(rem.length === 1 && rem[0].enabled === false && rem[0].time_of_day === "22:30" && rem[0].lead_days === 3, "reminder settings upserted (no duplicate row)");
const prof = (await as(A, () => q(`select daily_target_minutes, timezone from profiles where id=$1`, [A]))).rows[0];
check(prof.daily_target_minutes === 90 && prof.timezone === "Asia/Kolkata", "profile settings applied");

const r2 = (await imp(A, "fingerprint-aaaaaaaa-1", payload)).rows[0].r;
const chCount = Number((await as(A, () => q(`select count(*) from chapters where title='Imported ch'`))).rows[0].count);
check(r2.already_imported === true && chCount === 1, "re-importing the same fingerprint is a no-op (no duplicates)");

check((await as(B, () => q(`select * from chapters where id=$1`, [c1]))).rows.length === 0, "other user cannot see imported rows");
check((await as(B, () => q(`select * from data_imports`))).rows.length === 0, "other user cannot see import log");

const before = Number((await as(A, () => q(`select count(*) from chapters`))).rows[0].count);
let threw = false;
try {
  await imp(A, "fingerprint-bbbbbbbb-2", { chapters: [{ id: uuid(), title: "should roll back" }], topics: [{ id: uuid(), chapter_id: uuid(), title: "orphan" }] });
} catch (e) { threw = true; }
const after = Number((await as(A, () => q(`select count(*) from chapters`))).rows[0].count);
const logged = (await as(A, () => q(`select * from data_imports where fingerprint='fingerprint-bbbbbbbb-2'`))).rows.length;
check(threw && before === after && logged === 0, "failed import rolls back completely (no partial data, no import record)");

let crossFk = false;
const bTopic = (await as(A, () => q(`select id from topics where id=$1`, [t1]))).rows[0].id;
try { await imp(B, "fingerprint-cccccccc-3", { revision_records: [{ id: uuid(), topic_id: bTopic, revised_on: "2026-10-05" }] }); } catch { crossFk = true; }
check(crossFk, "import cannot attach rows to another user's records");

let anonBlocked = false;
await db.exec(`reset role; select set_config('request.uid','',false); grant usage on schema public, auth to anon;`);
try { await db.exec("set role anon;"); await q(`select public.import_local_snapshot('fingerprint-dddddddd-4','local_storage','{}'::jsonb,false)`); } catch { anonBlocked = true; } finally { await db.exec("reset role;"); }
check(anonBlocked, "import refuses anonymous (signed-out) callers");

let anonRead = false;
try { await db.exec("set role anon;"); await q("select * from public.chapters"); anonRead = true; } catch {} finally { await db.exec("reset role;"); }
check(!anonRead, "signed-out (anon) role has no table access");
const ungranted = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not has_table_privilege('authenticated', c.oid, 'select')`)).rows;
check(ungranted.length === 0, "authenticated can SELECT every table via explicit grants" + (ungranted.length ? ": missing " + ungranted.map((r) => r.relname).join(",") : ""));

// every user table has RLS enabled
const noRls = (await q(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)).rows;
check(noRls.length === 0, "RLS enabled on every public table" + (noRls.length ? ": missing " + noRls.map((r) => r.relname).join(",") : ""));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL DONE");
process.exit(failures ? 1 : 0);
