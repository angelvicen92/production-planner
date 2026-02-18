ALTER TABLE resource_types
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE resource_types
SET is_active = true
WHERE is_active IS NULL;
