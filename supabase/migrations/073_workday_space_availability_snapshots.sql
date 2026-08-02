-- SPEC10-008: authoritative workday and spatial availability snapshots.
-- Server-only: user authorization is enforced by server routes before supabaseAdmin.

ALTER TABLE public.program_settings
  ADD COLUMN IF NOT EXISTS default_work_start TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS default_work_end TEXT NOT NULL DEFAULT '21:00';

ALTER TABLE public.program_settings DROP CONSTRAINT IF EXISTS program_settings_default_work_format_check;
ALTER TABLE public.program_settings ADD CONSTRAINT program_settings_default_work_format_check CHECK (
  default_work_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND default_work_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);
ALTER TABLE public.program_settings DROP CONSTRAINT IF EXISTS program_settings_default_work_order_check;
ALTER TABLE public.program_settings ADD CONSTRAINT program_settings_default_work_order_check
  CHECK (default_work_start < default_work_end);

ALTER TABLE public.zones
  ADD COLUMN IF NOT EXISTS default_availability_start TEXT,
  ADD COLUMN IF NOT EXISTS default_availability_end TEXT;
ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_default_availability_pair_check;
ALTER TABLE public.zones ADD CONSTRAINT zones_default_availability_pair_check CHECK (
  (default_availability_start IS NULL) = (default_availability_end IS NULL)
);
ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_default_availability_format_check;
ALTER TABLE public.zones ADD CONSTRAINT zones_default_availability_format_check CHECK (
  default_availability_start IS NULL OR (
    default_availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND default_availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);
ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_default_availability_order_check;
ALTER TABLE public.zones ADD CONSTRAINT zones_default_availability_order_check
  CHECK (default_availability_start IS NULL OR default_availability_start < default_availability_end);

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS default_availability_start TEXT,
  ADD COLUMN IF NOT EXISTS default_availability_end TEXT;
ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_default_availability_pair_check;
ALTER TABLE public.spaces ADD CONSTRAINT spaces_default_availability_pair_check CHECK (
  (default_availability_start IS NULL) = (default_availability_end IS NULL)
);
ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_default_availability_format_check;
ALTER TABLE public.spaces ADD CONSTRAINT spaces_default_availability_format_check CHECK (
  default_availability_start IS NULL OR (
    default_availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND default_availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);
ALTER TABLE public.spaces DROP CONSTRAINT IF EXISTS spaces_default_availability_order_check;
ALTER TABLE public.spaces ADD CONSTRAINT spaces_default_availability_order_check
  CHECK (default_availability_start IS NULL OR default_availability_start < default_availability_end);

CREATE TABLE IF NOT EXISTS public.plan_zone_settings (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES public.zones(id),
  availability_start TEXT,
  availability_end TEXT,
  source TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_zone_settings_plan_zone_key UNIQUE (plan_id, zone_id),
  CONSTRAINT plan_zone_settings_availability_pair_check CHECK ((availability_start IS NULL) = (availability_end IS NULL)),
  CONSTRAINT plan_zone_settings_availability_format_check CHECK (availability_start IS NULL OR (availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
  CONSTRAINT plan_zone_settings_availability_order_check CHECK (availability_start IS NULL OR availability_start < availability_end)
);

CREATE TABLE IF NOT EXISTS public.plan_space_settings (
  id BIGSERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  space_id INTEGER NOT NULL REFERENCES public.spaces(id),
  zone_id INTEGER NOT NULL REFERENCES public.zones(id),
  availability_start TEXT,
  availability_end TEXT,
  source TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_space_settings_plan_space_key UNIQUE (plan_id, space_id),
  CONSTRAINT plan_space_settings_availability_pair_check CHECK ((availability_start IS NULL) = (availability_end IS NULL)),
  CONSTRAINT plan_space_settings_availability_format_check CHECK (availability_start IS NULL OR (availability_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND availability_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
  CONSTRAINT plan_space_settings_availability_order_check CHECK (availability_start IS NULL OR availability_start < availability_end)
);

ALTER TABLE public.plan_zone_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_space_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.plan_zone_settings, public.plan_space_settings FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.plan_zone_settings_id_seq, public.plan_space_settings_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.plan_zone_settings, public.plan_space_settings TO service_role;
GRANT ALL ON SEQUENCE public.plan_zone_settings_id_seq, public.plan_space_settings_id_seq TO service_role;

-- A NULL pair is the explicit inheritance marker. Existing plan workdays remain untouched.
INSERT INTO public.plan_zone_settings (plan_id, zone_id, availability_start, availability_end, source)
SELECT p.id, z.id, NULL, NULL, 'default'
FROM public.plans p CROSS JOIN public.zones z
ON CONFLICT (plan_id, zone_id) DO NOTHING;

INSERT INTO public.plan_space_settings (plan_id, space_id, zone_id, availability_start, availability_end, source)
SELECT p.id, s.id, s.zone_id, NULL, NULL, 'default'
FROM public.plans p CROSS JOIN public.spaces s
ON CONFLICT (plan_id, space_id) DO NOTHING;
