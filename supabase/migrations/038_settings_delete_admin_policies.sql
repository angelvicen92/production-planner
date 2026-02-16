-- 038_settings_delete_admin_policies.sql
-- Tighten Settings catalog tables for admin-managed writes/deletes.

ALTER TABLE IF EXISTS public.resource_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resource_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.itinerant_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.staff_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated write itinerant_teams" ON public.itinerant_teams;
DROP POLICY IF EXISTS "Allow authenticated write staff_people" ON public.staff_people;

DROP POLICY IF EXISTS resource_types_read_authenticated ON public.resource_types;
CREATE POLICY resource_types_read_authenticated
ON public.resource_types
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS resource_types_admin_all ON public.resource_types;
CREATE POLICY resource_types_admin_all
ON public.resource_types
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS resource_items_read_authenticated ON public.resource_items;
CREATE POLICY resource_items_read_authenticated
ON public.resource_items
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS resource_items_admin_all ON public.resource_items;
CREATE POLICY resource_items_admin_all
ON public.resource_items
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS itinerant_teams_read_authenticated ON public.itinerant_teams;
CREATE POLICY itinerant_teams_read_authenticated
ON public.itinerant_teams
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS itinerant_teams_admin_all ON public.itinerant_teams;
CREATE POLICY itinerant_teams_admin_all
ON public.itinerant_teams
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS staff_people_read_authenticated ON public.staff_people;
CREATE POLICY staff_people_read_authenticated
ON public.staff_people
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS staff_people_admin_all ON public.staff_people;
CREATE POLICY staff_people_admin_all
ON public.staff_people
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS zones_admin_delete ON public.zones;
CREATE POLICY zones_admin_delete
ON public.zones
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

DROP POLICY IF EXISTS spaces_admin_delete ON public.spaces;
CREATE POLICY spaces_admin_delete
ON public.spaces
FOR DELETE
TO authenticated
USING (public.has_role('admin'));
