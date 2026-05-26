-- ============================================================
-- Fix: RLS para permitir motorista corrigir e reenviar viagem
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- Pode rodar novamente sem problema (idempotente)
-- ============================================================

-- 1. Atualiza politica UPDATE de viagens
--    USING  = qual linha pode ser editada (OLD row: rascunho ou correcao)
--    WITH CHECK = como a linha pode ficar (NEW row: apenas dono da viagem)
--    Separar USING de WITH CHECK e necessario para permitir mudar status
--    de 'correcao' para 'enviado' sem violar a politica.
DROP POLICY IF EXISTS "Drivers can update own draft trips" ON public.trips;
DROP POLICY IF EXISTS "Drivers can update own trips"       ON public.trips;

CREATE POLICY "Drivers can update own trips" ON public.trips
  FOR UPDATE
  USING (
    (driver_id = auth.uid() AND status IN ('rascunho', 'correcao'))
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    -- nova linha pode ter qualquer status, basta continuar sendo do mesmo motorista
    driver_id = auth.uid()
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'admin')
  );

-- 2. Permite motorista deletar passageiros de viagens em rascunho ou correcao
--    (necessario para substituir lista de passageiros ao corrigir)
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

-- 3. Permite motorista atualizar fotos de viagem em correcao
--    (necessario para trocar foto ao corrigir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'photos' AND policyname = 'Update photos for correcao trips'
  ) THEN
    CREATE POLICY "Update photos for correcao trips" ON public.photos
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.trips
          WHERE trips.id = trip_id
            AND trips.driver_id = auth.uid()
            AND trips.status = 'correcao'
        )
      );
  END IF;
END $$;
