-- Fix: prevent_edit_after_send referenciava OLD.taxista que não existe (coluna correta: driver_id)
-- Isso causava erro ao supervisor aprovar/recusar viagens

CREATE OR REPLACE FUNCTION public.prevent_edit_after_send()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('enviado', 'pendente', 'aprovado', 'recusado') THEN
    IF OLD.driver_id   IS DISTINCT FROM NEW.driver_id   THEN RAISE EXCEPTION 'Cannot edit sent trip: driver_id'; END IF;
    IF OLD.placa       IS DISTINCT FROM NEW.placa       THEN RAISE EXCEPTION 'Cannot edit sent trip: placa'; END IF;
    IF OLD.km_inicial  IS DISTINCT FROM NEW.km_inicial  THEN RAISE EXCEPTION 'Cannot edit sent trip: km_inicial'; END IF;
    IF OLD.km_final    IS DISTINCT FROM NEW.km_final    THEN RAISE EXCEPTION 'Cannot edit sent trip: km_final'; END IF;
    IF OLD.justificativa IS DISTINCT FROM NEW.justificativa THEN RAISE EXCEPTION 'Cannot edit sent trip: justificativa'; END IF;
  END IF;

  -- Só supervisor/admin pode alterar valor_total
  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('supervisor', 'admin')
    ) THEN
      RAISE EXCEPTION 'Only supervisors and admins can set valor_total';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
