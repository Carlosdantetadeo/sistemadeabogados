-- Supabase's Data API must never bypass the NestJS resource policy.
-- No browser role receives a table policy or SQL privileges for application data.
DO $$
DECLARE relation_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['firms','users','sessions','login_states','invitations','clients','client_memberships','client_creation_grants','projects','project_grants','conflict_reviews','cases','case_grants','case_assignments','activities','activity_revisions','documents','document_versions','uploads','publications','publication_audiences','tasks','hearings','notices','deadlines','deadline_revisions','calendars','mailboxes','daily_checks','deliveries','imports','import_rows','costs','billing_drafts','billing_lines','reservations','invoice_references','payments','audit_events','jobs','ocr_jobs','ocr_pages','reports','deletion_requests','idempotency_records','rate_limits']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation_name);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon',relation_name);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated',relation_name);
  END IF;
 END LOOP;
END $$;
