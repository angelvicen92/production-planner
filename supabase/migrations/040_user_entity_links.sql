CREATE TABLE IF NOT EXISTS public.user_entity_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('staff_person','resource_item')),
  entity_id BIGINT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entity_type, is_primary)
);

CREATE INDEX IF NOT EXISTS idx_user_entity_links_user_id
  ON public.user_entity_links (user_id);

CREATE INDEX IF NOT EXISTS idx_user_entity_links_entity
  ON public.user_entity_links (entity_type, entity_id);

ALTER TABLE public.user_entity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_entity_links_select_self_or_admin ON public.user_entity_links;
CREATE POLICY user_entity_links_select_self_or_admin
ON public.user_entity_links
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role('admin'));

DROP POLICY IF EXISTS user_entity_links_admin_manage ON public.user_entity_links;
CREATE POLICY user_entity_links_admin_manage
ON public.user_entity_links
FOR ALL
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));
