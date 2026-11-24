-- =============================================================================
-- Green Book Tracker — explicit Data API grants
--
-- Supabase projects created after 30 May 2026 no longer grant new tables and
-- functions in `public` to the API roles automatically. Without these grants
-- every request fails with "permission denied for table …" (42501).
--
-- Only the `authenticated` role (signed-in users) gets access. `anon`
-- (signed-out visitors) gets nothing. Grants decide which tables a role may
-- touch at all; the RLS policies still decide which ROWS: only the user's own.
-- Safe to run more than once.
-- =============================================================================

grant usage on schema public to authenticated;

-- Profiles: no delete (the row is removed with the auth user via ON DELETE CASCADE)
grant select, insert, update on table public.profiles to authenticated;

grant select, insert, update, delete on table
  public.chapters,
  public.topics,
  public.check_ins,
  public.check_in_topics,
  public.study_sessions,
  public.study_tasks,
  public.daily_targets,
  public.weekly_goals,
  public.revision_records,
  public.interview_questions,
  public.question_attempts,
  public.reminders
to authenticated;

-- Import log: written only through import_local_snapshot(); read by the app
grant select, insert, update on table public.data_imports to authenticated;

-- Functions used by the import (runs as the caller, so the caller needs EXECUTE)
revoke all on function public._jsonb_text_array(jsonb)      from public, anon;
revoke all on function public._jsonb_smallint_array(jsonb)  from public, anon;
revoke all on function public._jsonb_rows(jsonb, text)      from public, anon;
grant execute on function public._jsonb_text_array(jsonb)      to authenticated;
grant execute on function public._jsonb_smallint_array(jsonb)  to authenticated;
grant execute on function public._jsonb_rows(jsonb, text)      to authenticated;
revoke all on function public.import_local_snapshot(text, text, jsonb, boolean) from public, anon;
grant execute on function public.import_local_snapshot(text, text, jsonb, boolean) to authenticated;

-- Make sure signed-out visitors can't reach any of it, even on older projects
-- where default privileges granted everything to anon.
revoke all on table
  public.profiles, public.chapters, public.topics, public.check_ins, public.check_in_topics,
  public.study_sessions, public.study_tasks, public.daily_targets, public.weekly_goals,
  public.revision_records, public.interview_questions, public.question_attempts,
  public.reminders, public.data_imports
from anon;
