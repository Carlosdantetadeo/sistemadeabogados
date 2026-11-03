-- Migration history is server-managed and must not be writable through the Data API.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC;

DO $$
DECLARE browser_role text;
BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated']
 LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   EXECUTE format('REVOKE ALL ON TABLE public.schema_migrations FROM %I',browser_role);
  END IF;
 END LOOP;
END $$;
