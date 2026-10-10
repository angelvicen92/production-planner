-- OPTIONAL: a new demo account only, with separate explicit authorization.
-- Existing authorized admin/production accounts need no change. Never reassign their roles.
-- Create the new Auth user in Supabase first. In the same SQL session:
-- SET optiplan.confirmed_demo_project = 'dyqusivzgxebkxkwohwn';
-- SET optiplan.operator_creation_approved = 'yes';
-- SET optiplan.demo_operator_email = '<email of that demo user>';
BEGIN;
DO $$ BEGIN
 IF current_setting('optiplan.confirmed_demo_project',true) IS DISTINCT FROM 'dyqusivzgxebkxkwohwn'
    OR current_setting('optiplan.operator_creation_approved',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'DEMO_TARGET_CONFIRMATION_REQUIRED';
 END IF;
 IF (SELECT count(*) FROM auth.users WHERE lower(email)=lower(current_setting('optiplan.demo_operator_email',true)))<>1 THEN
  RAISE EXCEPTION 'CREATE_THE_DEMO_AUTH_USER_FIRST';
 END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=(SELECT id FROM auth.users WHERE lower(email)=lower(current_setting('optiplan.demo_operator_email',true)))) THEN
  RAISE EXCEPTION 'DEMO_USER_ALREADY_HAS_A_ROLE';
 END IF;
END $$;
INSERT INTO public.roles(key,name)
SELECT 'production','Producción'
WHERE NOT EXISTS(SELECT 1 FROM public.roles WHERE key='production');
INSERT INTO public.user_roles(user_id,role_id)
SELECT u.id,r.id FROM auth.users u CROSS JOIN public.roles r
WHERE lower(u.email)=lower(current_setting('optiplan.demo_operator_email',true)) AND r.key='production';
COMMIT;
