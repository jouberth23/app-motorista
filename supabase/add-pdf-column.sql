-- ============================================================
-- TaxiVoucher: add pdf_path column to trips
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Column to store the PDF storage path
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;

-- 2. After running this SQL, create the storage bucket manually:
--    Supabase Dashboard → Storage → New Bucket
--    Name: trip-documents
--    Public: YES (so PDFs can be accessed via public URL)
--    File size limit: 10MB
