-- ============================================================
-- Fix: RLS para permitir motorista atualizar viagem em correcao
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Atualiza politica UPDATE de viagens para incluir status 'correcao'
--    Antes: motorista so podia editar rascunho
--    Agora: motorista pode editar rascunho OU correcao (para reenviar corrigida)
DROP POLICY IF EXISTS "Drivers can update own draft trips" ON public.trips;

CREATE POLICY "Drivers can update own trips" ON public.trips
  FOR UPDATE
  USING (
    (driver_id = auth.uid() AND status IN ('rascunho', 'correcao'))
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'admin')
  );

-- 2. Adiciona politica DELETE em passengers para o motorista
--    Necessario para substituir a lista de passageiros ao corrigir a viagem
--    Restrito a viagens em rascunho ou correcao (seguro: apos reenvio o trigger bloqueia edicoes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'passengers' AND policyname = 'Delete passengers'
  ) THEN
    CREATE POLICY "Delete passengers" ON public.passengers
      FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.trips
          WHERE trips.id = trip_id
            AND trips.driver_id = auth.uid()
            AND trips.status IN ('rascunho', 'correcao')
        )
      );
  END IF;
END $$;
