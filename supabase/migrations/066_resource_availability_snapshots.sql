-- SPEC10-006: one continuous availability window on the global resource and daily snapshot.
-- Existing rows remain NULL/NULL, meaning the complete (dynamic) plan workday.

ALTER TABLE public.resource_items
  ADD COLUMN IF NOT EXISTS default_availability_start TEXT NULL,
  ADD COLUMN IF NOT EXISTS default_availability_end TEXT NULL;

ALTER TABLE public.plan_resource_items
  ADD COLUMN IF NOT EXISTS availability_start TEXT NULL,
  ADD COLUMN IF NOT EXISTS availability_end TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_items_default_availability_pair_check' AND conrelid = 'public.resource_items'::regclass) THEN
    ALTER TABLE public.resource_items ADD CONSTRAINT resource_items_default_availability_pair_check
      CHECK ((default_availability_start IS NULL) = (default_availability_end IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_items_default_availability_format_check' AND conrelid = 'public.resource_items'::regclass) THEN
    ALTER TABLE public.resource_items ADD CONSTRAINT resource_items_default_availability_format_check
      CHECK (default_availability_start IS NULL OR (
        default_availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND default_availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_items_default_availability_order_check' AND conrelid = 'public.resource_items'::regclass) THEN
    ALTER TABLE public.resource_items ADD CONSTRAINT resource_items_default_availability_order_check
      CHECK (default_availability_start IS NULL OR default_availability_start < default_availability_end);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_resource_items_availability_pair_check' AND conrelid = 'public.plan_resource_items'::regclass) THEN
    ALTER TABLE public.plan_resource_items ADD CONSTRAINT plan_resource_items_availability_pair_check
      CHECK ((availability_start IS NULL) = (availability_end IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_resource_items_availability_format_check' AND conrelid = 'public.plan_resource_items'::regclass) THEN
    ALTER TABLE public.plan_resource_items ADD CONSTRAINT plan_resource_items_availability_format_check
      CHECK (availability_start IS NULL OR (
        availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_resource_items_availability_order_check' AND conrelid = 'public.plan_resource_items'::regclass) THEN
    ALTER TABLE public.plan_resource_items ADD CONSTRAINT plan_resource_items_availability_order_check
      CHECK (availability_start IS NULL OR availability_start < availability_end);
  END IF;
END
$$;
