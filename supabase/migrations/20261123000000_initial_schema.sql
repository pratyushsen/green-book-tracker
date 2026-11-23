-- =============================================================================
-- Green Book Tracker — initial schema
-- Run in the Supabase SQL editor, or with `supabase db push`.
-- Every user-owned table carries user_id and is protected by Row Level Security
-- so a signed-in user can only ever read or write their own rows.
-- Requires Postgres 15+ (Supabase default) for ON DELETE SET NULL (column).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Helper: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user) — settings live here too
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text,
  timezone                text not null default 'UTC',
  daily_target_minutes    integer not null default 120 check (daily_target_minutes between 0 and 1440),
  weekly_target_minutes   integer not null default 720 check (weekly_target_minutes between 0 and 10080),
  weekly_topic_goal       integer not null default 5 check (weekly_topic_goal between 0 and 500),
  revision_interval_days  integer not null default 14 check (revision_interval_days between 1 and 365),
  stale_after_days        integer not null default 21 check (stale_after_days between 1 and 365),
  week_starts_on          smallint not null default 1 check (week_starts_on between 0 and 6),
  target_completion_date  date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Book structure: chapters -> topics (user-defined; nothing is pre-seeded)
-- ---------------------------------------------------------------------------
create table public.chapters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number      text,
  title       text not null check (char_length(title) between 1 and 300),
  description text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index chapters_user_idx on public.chapters (user_id, position);
create trigger chapters_updated_at before update on public.chapters
  for each row execute function public.set_updated_at();

create table public.topics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id        uuid not null,
  title             text not null check (char_length(title) between 1 and 300),
  position          integer not null default 0,
  status            text not null default 'not_started'
                      check (status in ('not_started', 'in_progress', 'completed')),
  difficulty        text check (difficulty in ('easy', 'medium', 'hard')),
  confidence        smallint check (confidence between 1 and 5),
  completed_on      date,
  last_studied_on   date,
  notes             text,
  formulas          text,
  in_revision_list  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (chapter_id, user_id) references public.chapters (id, user_id) on delete cascade
);
create index topics_user_idx on public.topics (user_id, chapter_id, position);
create trigger topics_updated_at before update on public.topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily check-ins (one per user per day) + topics studied that day
-- ---------------------------------------------------------------------------
create table public.check_ins (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  studied          boolean not null default true,
  minutes          integer not null default 0 check (minutes between 0 and 1440),
  problems_solved  integer not null default 0 check (problems_solved >= 0),
  learned          text,
  difficulties     text,
  tomorrow_focus   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, date),
  unique (id, user_id)
);
create trigger check_ins_updated_at before update on public.check_ins
  for each row execute function public.set_updated_at();

create table public.check_in_topics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  check_in_id  uuid not null,
  topic_id     uuid not null,
  unique (check_in_id, topic_id),
  foreign key (check_in_id, user_id) references public.check_ins (id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index check_in_topics_user_idx on public.check_in_topics (user_id);

-- ---------------------------------------------------------------------------
-- Study sessions — the single source of truth for study time
-- (a check-in creates/updates one linked session; extra sessions can be logged)
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  minutes          integer not null check (minutes between 1 and 1440),
  activity         text not null default 'reading'
                     check (activity in ('reading', 'problems', 'revision', 'interview_prep', 'other')),
  problems_solved  integer not null default 0 check (problems_solved >= 0),
  topic_id         uuid,
  chapter_id       uuid,
  check_in_id      uuid,
  notes            text,
  created_at       timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (chapter_id, user_id) references public.chapters (id, user_id) on delete set null (chapter_id),
  foreign key (check_in_id, user_id) references public.check_ins (id, user_id) on delete cascade
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, date);

-- ---------------------------------------------------------------------------
-- Planning: tasks, per-day targets, weekly goals
-- ---------------------------------------------------------------------------
create table public.study_tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 300),
  description        text,
  topic_id           uuid,
  chapter_id         uuid,
  scheduled_date     date,
  deadline           date,
  priority           text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status             text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  planned_minutes    integer not null default 0 check (planned_minutes between 0 and 1440),
  rescheduled_count  integer not null default 0,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id),
  foreign key (chapter_id, user_id) references public.chapters (id, user_id) on delete set null (chapter_id)
);
create index study_tasks_user_idx on public.study_tasks (user_id, scheduled_date);
create trigger study_tasks_updated_at before update on public.study_tasks
  for each row execute function public.set_updated_at();

create table public.daily_targets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  target_minutes   integer not null check (target_minutes between 0 and 1440),
  target_problems  integer not null default 0 check (target_problems >= 0),
  unique (user_id, date)
);

create table public.weekly_goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start      date not null,
  target_minutes  integer not null default 0 check (target_minutes >= 0),
  target_topics   integer not null default 0 check (target_topics >= 0),
  notes           text,
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Revision history (revision count = number of rows per topic)
-- ---------------------------------------------------------------------------
create table public.revision_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id          uuid not null,
  revised_on        date not null,
  confidence_after  smallint check (confidence_after between 1 and 5),
  notes             text,
  created_at        timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete cascade
);
create index revision_records_user_idx on public.revision_records (user_id, topic_id);

-- ---------------------------------------------------------------------------
-- Interview question bank + attempts
-- ---------------------------------------------------------------------------
create table public.interview_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  body        text,
  category    text,
  difficulty  text check (difficulty in ('easy', 'medium', 'hard')),
  source      text,
  solution    text,
  tags        text[] not null default '{}',
  topic_id    uuid,
  starred     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);
create index interview_questions_user_idx on public.interview_questions (user_id);
create trigger interview_questions_updated_at before update on public.interview_questions
  for each row execute function public.set_updated_at();

create table public.question_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id         uuid not null,
  attempted_on        date not null,
  correct             boolean not null,
  time_spent_minutes  integer check (time_spent_minutes >= 0),
  mistake             text,
  lesson              text,
  created_at          timestamptz not null default now(),
  foreign key (question_id, user_id) references public.interview_questions (id, user_id) on delete cascade
);
create index question_attempts_user_idx on public.question_attempts (user_id, question_id);

-- ---------------------------------------------------------------------------
-- Reminder configuration (evaluated in the browser while the app is open)
-- ---------------------------------------------------------------------------
create table public.reminders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type                  text not null check (type in
                          ('daily_checkin', 'unfinished_target', 'deadline', 'weekly_review', 'revision_due')),
  enabled               boolean not null default true,
  time_of_day           text not null default '20:00' check (time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days_of_week          smallint[] not null default '{0,1,2,3,4,5,6}',
  browser_notification  boolean not null default false,
  lead_days             smallint not null default 2 check (lead_days between 0 and 30),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, type)
);
create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: profile + default reminder rows
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.reminders (user_id, type, enabled, time_of_day, days_of_week, lead_days) values
    (new.id, 'daily_checkin',     true,  '21:00', '{0,1,2,3,4,5,6}', 2),
    (new.id, 'unfinished_target', true,  '19:00', '{0,1,2,3,4,5,6}', 2),
    (new.id, 'deadline',          true,  '09:00', '{0,1,2,3,4,5,6}', 2),
    (new.id, 'weekly_review',     true,  '18:00', '{0}',             2),
    (new.id, 'revision_due',      true,  '08:00', '{0,1,2,3,4,5,6}', 2);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "profiles: owner select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: owner update" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'chapters', 'topics', 'check_ins', 'check_in_topics', 'study_sessions', 'study_tasks',
    'daily_targets', 'weekly_goals', 'revision_records', 'interview_questions',
    'question_attempts', 'reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s: owner select" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: owner delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;
