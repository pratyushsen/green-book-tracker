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
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`);
await db.exec(fs.readFileSync(process.argv[2] ?? new URL("../supabase/migrations/20261123000000_initial_schema.sql", import.meta.url), "utf8"));
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;`);
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
console.log("ALL DONE");
