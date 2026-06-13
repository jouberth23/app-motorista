-- =====================================================================
-- Correções do Sistema Transmundim Logística (2026)
-- Migração idempotente: pode ser executada mais de uma vez com segurança
-- =====================================================================

-- =====================================================================
-- 1) Feature 3: ECI -> ECJ (migração de dados existentes)
-- =====================================================================
UPDATE public.trips SET setor = 'ECJ' WHERE setor = 'ECI';

-- =====================================================================
-- 2) Feature 5: permitir correção por Central/Admin (qualquer status)
--    e por Motorista em viagens aprovadas/recusadas (volta p/ 'enviado')
-- =====================================================================
CREATE OR REPLACE FUNCTION public.prevent_edit_after_send()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('enviado', 'pendente', 'aprovado', 'recusado')
     AND NOT (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'))
     AND NOT (
       OLD.driver_id = auth.uid()
       AND OLD.status IN ('aprovado', 'recusado')
       AND NEW.status = 'enviado'
     ) THEN
    IF OLD.driver_id     IS DISTINCT FROM NEW.driver_id     THEN RAISE EXCEPTION 'Cannot edit sent trip: driver_id'; END IF;
    IF OLD.placa         IS DISTINCT FROM NEW.placa         THEN RAISE EXCEPTION 'Cannot edit sent trip: placa'; END IF;
    IF OLD.km_inicial    IS DISTINCT FROM NEW.km_inicial    THEN RAISE EXCEPTION 'Cannot edit sent trip: km_inicial'; END IF;
    IF OLD.km_final      IS DISTINCT FROM NEW.km_final      THEN RAISE EXCEPTION 'Cannot edit sent trip: km_final'; END IF;
    IF OLD.justificativa IS DISTINCT FROM NEW.justificativa THEN RAISE EXCEPTION 'Cannot edit sent trip: justificativa'; END IF;
  END IF;

  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
    ) THEN
      RAISE EXCEPTION 'Only supervisors and admins can set valor_total';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Drivers can update own trips" ON public.trips;
CREATE POLICY "Drivers can update own trips" ON public.trips
  FOR UPDATE
  USING (
    (driver_id = auth.uid() AND status IN ('rascunho', 'correcao', 'aprovado', 'recusado'))
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    driver_id = auth.uid()
    OR has_role(auth.uid(), 'supervisor')
    OR has_role(auth.uid(), 'admin')
  );

-- Permite que Central/Admin editem passageiros ao corrigir uma viagem
-- (políticas adicionais, somadas via OR às já existentes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='passengers' AND policyname='Central delete passengers') THEN
    CREATE POLICY "Central delete passengers" ON public.passengers
      FOR DELETE
      USING (has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='passengers' AND policyname='Central insert passengers') THEN
    CREATE POLICY "Central insert passengers" ON public.passengers
      FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.trips WHERE trips.id = trip_id AND (has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'admin')))
      );
  END IF;
END $$;

-- =====================================================================
-- 3) Feature 7: tabela de despesas por viagem/motorista
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES auth.users(id),
  tipo text NOT NULL,
  valor numeric(10,2) NOT NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip_id ON public.trip_expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_driver_id ON public.trip_expenses(driver_id);

ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_expenses' AND policyname='View own or central expenses') THEN
    CREATE POLICY "View own or central expenses" ON public.trip_expenses
      FOR SELECT
      USING (driver_id = auth.uid() OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_expenses' AND policyname='Insert own or central expenses') THEN
    CREATE POLICY "Insert own or central expenses" ON public.trip_expenses
      FOR INSERT
      WITH CHECK (driver_id = auth.uid() OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_expenses' AND policyname='Delete own or central expenses') THEN
    CREATE POLICY "Delete own or central expenses" ON public.trip_expenses
      FOR DELETE
      USING (driver_id = auth.uid() OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'admin'));
  END IF;
END $$;

-- =====================================================================
-- 4) Feature 8: numeração sequencial global dos vouchers
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS public.trips_numero_sequencial_seq;

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS numero_sequencial integer;

-- backfill retroativo por ordem de criação
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.trips
  WHERE numero_sequencial IS NULL
)
UPDATE public.trips t SET numero_sequencial = o.rn
FROM ordered o
WHERE t.id = o.id;

-- ajusta a sequence para continuar a partir do maior número existente
SELECT setval('public.trips_numero_sequencial_seq', COALESCE((SELECT MAX(numero_sequencial) FROM public.trips), 0) + 1, false);

ALTER TABLE public.trips ALTER COLUMN numero_sequencial SET DEFAULT nextval('public.trips_numero_sequencial_seq');
ALTER TABLE public.trips ALTER COLUMN numero_sequencial SET NOT NULL;
ALTER SEQUENCE public.trips_numero_sequencial_seq OWNED BY public.trips.numero_sequencial;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_numero_sequencial_key') THEN
    ALTER TABLE public.trips ADD CONSTRAINT trips_numero_sequencial_key UNIQUE (numero_sequencial);
  END IF;
END $$;
