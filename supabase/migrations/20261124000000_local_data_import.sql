-- =============================================================================
-- Green Book Tracker — safe import of legacy browser (localStorage) data
--
-- import_local_snapshot() inserts a whole snapshot in ONE transaction: either
-- every row lands or nothing does. It runs as the calling user (SECURITY
-- INVOKER), so every insert still passes Row Level Security, and user_id is
-- always forced to auth.uid(). A fingerprint of the source data is recorded
-- so the same snapshot can never be imported twice into the same account.
-- Requires 20261123000000_initial_schema.sql.
-- =============================================================================

create table if not exists public.data_imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source       text not null check (source in ('local_storage', 'backup_file')),
  fingerprint  text not null check (char_length(fingerprint) between 16 and 128),
  row_counts   jsonb not null default '{}'::jsonb,
  imported_at  timestamptz not null default now(),
  unique (user_id, fingerprint)
);

alter table public.data_imports enable row level security;
drop policy if exists "data_imports: owner select" on public.data_imports;
drop policy if exists "data_imports: owner insert" on public.data_imports;
drop policy if exists "data_imports: owner update" on public.data_imports;
create policy "data_imports: owner select" on public.data_imports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "data_imports: owner insert" on public.data_imports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "data_imports: owner update" on public.data_imports
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Helpers to read jsonb arrays safely
create or replace function public._jsonb_text_array(v jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x), '{}'::text[])
  from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) as t(x)
$$;

create or replace function public._jsonb_smallint_array(v jsonb)
returns smallint[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x::smallint), '{}'::smallint[])
  from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) as t(x)
$$;

create or replace function public._jsonb_rows(p jsonb, k text)
returns setof jsonb language sql immutable set search_path = '' as $$
  select r from jsonb_array_elements(
    case when jsonb_typeof(p -> k) = 'array' then p -> k else '[]'::jsonb end
  ) as t(r)
$$;

create or replace function public.import_local_snapshot(
  p_fingerprint     text,
  p_source          text,
  p_data            jsonb,
  p_apply_settings  boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_import  uuid;
  v_counts  jsonb := '{}'::jsonb;
  n         integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to import data' using errcode = '42501';
  end if;

  insert into public.data_imports (user_id, source, fingerprint)
  values (v_uid, p_source, p_fingerprint)
  on conflict (user_id, fingerprint) do nothing
  returning id into v_import;

  if v_import is null then
    return jsonb_build_object(
      'already_imported', true,
      'row_counts', (select row_counts from public.data_imports where user_id = v_uid and fingerprint = p_fingerprint)
    );
  end if;

  insert into public.chapters (id, user_id, number, title, description, position, created_at)
  select (r->>'id')::uuid, v_uid, r->>'number', r->>'title', r->>'description',
         coalesce((r->>'position')::integer, 0), coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'chapters') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('chapters', n);

  insert into public.topics (id, user_id, chapter_id, title, position, status, difficulty, confidence,
                             completed_on, last_studied_on, notes, formulas, in_revision_list, created_at)
  select (r->>'id')::uuid, v_uid, (r->>'chapter_id')::uuid, r->>'title', coalesce((r->>'position')::integer, 0),
         coalesce(r->>'status', 'not_started'), r->>'difficulty', (r->>'confidence')::smallint,
         (r->>'completed_on')::date, (r->>'last_studied_on')::date, r->>'notes', r->>'formulas',
         coalesce((r->>'in_revision_list')::boolean, false), coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'topics') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('topics', n);

  insert into public.check_ins (id, user_id, date, studied, minutes, problems_solved, learned, difficulties,
                                tomorrow_focus, created_at)
  select (r->>'id')::uuid, v_uid, (r->>'date')::date, coalesce((r->>'studied')::boolean, true),
         coalesce((r->>'minutes')::integer, 0), coalesce((r->>'problems_solved')::integer, 0),
         r->>'learned', r->>'difficulties', r->>'tomorrow_focus', coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'check_ins') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('check_ins', n);

  insert into public.check_in_topics (id, user_id, check_in_id, topic_id)
  select (r->>'id')::uuid, v_uid, (r->>'check_in_id')::uuid, (r->>'topic_id')::uuid
  from public._jsonb_rows(p_data, 'check_in_topics') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('check_in_topics', n);

  insert into public.study_sessions (id, user_id, date, minutes, activity, problems_solved, topic_id, chapter_id,
                                     check_in_id, notes, created_at)
  select (r->>'id')::uuid, v_uid, (r->>'date')::date, (r->>'minutes')::integer, coalesce(r->>'activity', 'reading'),
         coalesce((r->>'problems_solved')::integer, 0), (r->>'topic_id')::uuid, (r->>'chapter_id')::uuid,
         (r->>'check_in_id')::uuid, r->>'notes', coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'study_sessions') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('study_sessions', n);

  insert into public.study_tasks (id, user_id, title, description, topic_id, chapter_id, scheduled_date, deadline,
                                  priority, status, planned_minutes, rescheduled_count, completed_at, created_at)
  select (r->>'id')::uuid, v_uid, r->>'title', r->>'description', (r->>'topic_id')::uuid, (r->>'chapter_id')::uuid,
         (r->>'scheduled_date')::date, (r->>'deadline')::date, coalesce(r->>'priority', 'medium'),
         coalesce(r->>'status', 'todo'), coalesce((r->>'planned_minutes')::integer, 0),
         coalesce((r->>'rescheduled_count')::integer, 0), (r->>'completed_at')::timestamptz,
         coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'study_tasks') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('study_tasks', n);

  insert into public.daily_targets (id, user_id, date, target_minutes, target_problems)
  select (r->>'id')::uuid, v_uid, (r->>'date')::date, (r->>'target_minutes')::integer,
         coalesce((r->>'target_problems')::integer, 0)
  from public._jsonb_rows(p_data, 'daily_targets') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('daily_targets', n);

  insert into public.weekly_goals (id, user_id, week_start, target_minutes, target_topics, notes)
  select (r->>'id')::uuid, v_uid, (r->>'week_start')::date, coalesce((r->>'target_minutes')::integer, 0),
         coalesce((r->>'target_topics')::integer, 0), r->>'notes'
  from public._jsonb_rows(p_data, 'weekly_goals') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('weekly_goals', n);

  insert into public.revision_records (id, user_id, topic_id, revised_on, confidence_after, notes, created_at)
  select (r->>'id')::uuid, v_uid, (r->>'topic_id')::uuid, (r->>'revised_on')::date,
         (r->>'confidence_after')::smallint, r->>'notes', coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'revision_records') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('revision_records', n);

  insert into public.interview_questions (id, user_id, title, body, category, difficulty, source, solution, tags,
                                          topic_id, starred, created_at)
  select (r->>'id')::uuid, v_uid, r->>'title', r->>'body', r->>'category', r->>'difficulty', r->>'source',
         r->>'solution', public._jsonb_text_array(r->'tags'), (r->>'topic_id')::uuid,
         coalesce((r->>'starred')::boolean, false), coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'interview_questions') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('interview_questions', n);

  insert into public.question_attempts (id, user_id, question_id, attempted_on, correct, time_spent_minutes,
                                        mistake, lesson, created_at)
  select (r->>'id')::uuid, v_uid, (r->>'question_id')::uuid, (r->>'attempted_on')::date,
         coalesce((r->>'correct')::boolean, false), (r->>'time_spent_minutes')::integer, r->>'mistake',
         r->>'lesson', coalesce((r->>'created_at')::timestamptz, now())
  from public._jsonb_rows(p_data, 'question_attempts') r;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('question_attempts', n);

  if p_apply_settings then
    insert into public.reminders (user_id, type, enabled, time_of_day, days_of_week, browser_notification, lead_days)
    select v_uid, r->>'type', coalesce((r->>'enabled')::boolean, true), coalesce(r->>'time_of_day', '20:00'),
           case when jsonb_typeof(r->'days_of_week') = 'array'
                then public._jsonb_smallint_array(r->'days_of_week') else '{0,1,2,3,4,5,6}'::smallint[] end,
           coalesce((r->>'browser_notification')::boolean, false), coalesce((r->>'lead_days')::smallint, 2)
    from public._jsonb_rows(p_data, 'reminders') r
    on conflict (user_id, type) do update set
      enabled = excluded.enabled,
      time_of_day = excluded.time_of_day,
      days_of_week = excluded.days_of_week,
      browser_notification = excluded.browser_notification,
      lead_days = excluded.lead_days;
    get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('reminders', n);

    if jsonb_typeof(p_data -> 'profile') = 'object' then
      update public.profiles p set
        display_name           = coalesce(p_data->'profile'->>'display_name', p.display_name),
        timezone               = coalesce(p_data->'profile'->>'timezone', p.timezone),
        daily_target_minutes   = coalesce((p_data->'profile'->>'daily_target_minutes')::integer, p.daily_target_minutes),
        weekly_target_minutes  = coalesce((p_data->'profile'->>'weekly_target_minutes')::integer, p.weekly_target_minutes),
        weekly_topic_goal      = coalesce((p_data->'profile'->>'weekly_topic_goal')::integer, p.weekly_topic_goal),
        revision_interval_days = coalesce((p_data->'profile'->>'revision_interval_days')::integer, p.revision_interval_days),
        stale_after_days       = coalesce((p_data->'profile'->>'stale_after_days')::integer, p.stale_after_days),
        week_starts_on         = coalesce((p_data->'profile'->>'week_starts_on')::smallint, p.week_starts_on),
        target_completion_date = coalesce((p_data->'profile'->>'target_completion_date')::date, p.target_completion_date)
      where p.id = v_uid;
      get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('profile', n);
    end if;
  end if;

  update public.data_imports set row_counts = v_counts where id = v_import;
  return jsonb_build_object('already_imported', false, 'import_id', v_import, 'row_counts', v_counts);
end;
$$;

revoke all on function public.import_local_snapshot(text, text, jsonb, boolean) from public, anon;
grant execute on function public.import_local_snapshot(text, text, jsonb, boolean) to authenticated;
