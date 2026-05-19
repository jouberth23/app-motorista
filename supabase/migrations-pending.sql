-- ============================================================
-- TaxiVoucher — Migrations Pendentes (rodar no Supabase SQL Editor)
-- Execute TUDO de uma vez ou em ordem
-- ============================================================

-- ── 1. Corrige trigger que referenciava OLD.taxista inexistente ───────────────
CREATE OR REPLACE FUNCTION public.prevent_edit_after_send()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('enviado', 'pendente', 'aprovado', 'recusado') THEN
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

-- ── 2. Políticas INSERT para profiles e user_roles (necessário para cadastro) ─
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Allow insert profiles'
  ) THEN
    CREATE POLICY "Allow insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_roles' AND policyname = 'Allow insert user_roles'
  ) THEN
    CREATE POLICY "Allow insert user_roles" ON public.user_roles FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ── 3. Coluna cargo em profiles + tabela access_codes ─────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;

CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  role app_role NOT NULL,
  label text,
  ativo boolean DEFAULT true,
  max_uses integer NULL,
  used_count integer DEFAULT 0,
  expires_at timestamptz NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'access_codes' AND policyname = 'anyone can read access codes'
  ) THEN
    CREATE POLICY "anyone can read access codes" ON public.access_codes FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'access_codes' AND policyname = 'admins manage access codes'
  ) THEN
    CREATE POLICY "admins manage access codes" ON public.access_codes
      FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Códigos demo
INSERT INTO public.access_codes (codigo, role, label) VALUES
  ('23424531', 'motorista',  'Chave Motorista Demo'),
  ('98765432', 'supervisor', 'Chave Supervisor Demo'),
  ('11223344', 'admin',      'Chave Admin Demo')
ON CONFLICT (codigo) DO NOTHING;

-- handle_new_user atualizado com validação de access_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role  app_role := 'motorista';
  code_role  app_role;
  p_code     text;
BEGIN
  p_code := NEW.raw_user_meta_data->>'access_code';

  IF p_code IS NOT NULL THEN
    SELECT ac.role INTO code_role
    FROM public.access_codes ac
    WHERE ac.codigo = p_code
      AND ac.ativo = true
      AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
      AND (ac.max_uses IS NULL OR ac.used_count < ac.max_uses);

    IF code_role IS NOT NULL THEN
      user_role := code_role;
      UPDATE public.access_codes SET used_count = used_count + 1 WHERE codigo = p_code;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, nome, telefone, base, cargo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'telefone',
    NEW.raw_user_meta_data->>'base',
    NEW.raw_user_meta_data->>'cargo'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4. Status 'correcao' + coluna motivo_correcao ─────────────────────────────
ALTER TYPE public.trip_status ADD VALUE IF NOT EXISTS 'correcao';

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS motivo_correcao text;

-- Adiciona 'correcao' no enum de approvals (necessário para solicitar correção)
ALTER TYPE public.approval_action ADD VALUE IF NOT EXISTS 'correcao';

-- ── 5. Colunas de metadados de foto (localização, carimbo) ────────────────────
-- ESTA É A MIGRATION CRÍTICA — resolve o erro de envio de viagem
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS latitude              numeric,
  ADD COLUMN IF NOT EXISTS longitude             numeric,
  ADD COLUMN IF NOT EXISTS address               text,
  ADD COLUMN IF NOT EXISTS location_accuracy     numeric,
  ADD COLUMN IF NOT EXISTS captured_at           timestamptz,
  ADD COLUMN IF NOT EXISTS stamped_storage_path  text,
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS device_timezone       text,
  ADD COLUMN IF NOT EXISTS location_denied       boolean DEFAULT false;

-- ── 6. Colunas de PDF em trips ────────────────────────────────────────────────
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pdf_path         text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz;

-- ── 7. Tabela whatsapp_sends ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_sends (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id              uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  sent_by              uuid REFERENCES auth.users(id) NOT NULL,
  recipient_name       text,
  recipient_phone      text NOT NULL,
  recipient_kind       text DEFAULT 'manual',
  status               text DEFAULT 'pending',
  error_message        text,
  evolution_message_id text,
  extra_message        text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_sends ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_sends' AND policyname = 'central_manage_whatsapp_sends'
  ) THEN
    CREATE POLICY "central_manage_whatsapp_sends" ON whatsapp_sends FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role IN ('supervisor', 'admin')
      )
    );
  END IF;
END $$;
