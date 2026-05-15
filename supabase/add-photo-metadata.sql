-- Migration: Add photo metadata columns for stamp/location audit feature

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS latitude         numeric,
  ADD COLUMN IF NOT EXISTS longitude        numeric,
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS location_accuracy numeric,
  ADD COLUMN IF NOT EXISTS captured_at      timestamptz,
  ADD COLUMN IF NOT EXISTS stamped_storage_path text,
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS device_timezone  text,
  ADD COLUMN IF NOT EXISTS location_denied  boolean DEFAULT false;

-- storage_path continues to point to the stamped version (primary display image)
-- original_storage_path keeps the raw unprocessed file
