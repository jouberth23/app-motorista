-- ============================================================
-- TaxiVoucher: add 'correcao' status and motivo_correcao column
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Add 'correcao' value to the trip_status enum
ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'correcao';

-- 2. Add motivo_correcao column to trips table
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS motivo_correcao text;

-- 3. Allow 'correcao' action in approvals table
--    (if action is a text column this is automatic; if it's an enum, run below)
-- ALTER TYPE public.approval_action ADD VALUE IF NOT EXISTS 'correcao';
