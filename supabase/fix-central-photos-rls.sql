-- ============================================================
-- Fix: permite Central/Admin substituir fotos ao corrigir viagem
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- Idempotente — pode rodar novamente sem problema
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'photos' AND policyname = 'Central update photos'
  ) THEN
    CREATE POLICY "Central update photos" ON public.photos
      FOR UPDATE
      USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'));
  END IF;
END $$;
