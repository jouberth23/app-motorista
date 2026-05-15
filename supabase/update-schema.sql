-- ============================================================
-- TaxiVoucher — Schema Update: Access Codes + Role-based Auth
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add cargo column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;

-- 2. Create access_codes table
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

-- Anyone can read codes (needed to validate during registration)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'access_codes' AND policyname = 'anyone can read access codes'
  ) THEN
    CREATE POLICY "anyone can read access codes" ON public.access_codes
      FOR SELECT USING (true);
  END IF;
END $$;

-- Only admins can write
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'access_codes' AND policyname = 'admins manage access codes'
  ) THEN
    CREATE POLICY "admins manage access codes" ON public.access_codes
      FOR ALL USING (has_role('admin')) WITH CHECK (has_role('admin'));
  END IF;
END $$;

-- 3. Demo access codes
INSERT INTO public.access_codes (codigo, role, label) VALUES
  ('23424531', 'motorista',  'Chave Motorista Demo'),
  ('98765432', 'supervisor', 'Chave Supervisor Demo'),
  ('11223344', 'admin',      'Chave Admin Demo')
ON CONFLICT (codigo) DO NOTHING;

-- 4. Updated handle_new_user: validates role via access code server-side
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role  app_role := 'motorista';
  code_role  app_role;
  p_code     text;
BEGIN
  p_code := NEW.raw_user_meta_data->>'access_code';

  -- Determine role from access code (server-side validation — cannot be spoofed)
  IF p_code IS NOT NULL THEN
    SELECT ac.role INTO code_role
    FROM public.access_codes ac
    WHERE ac.codigo = p_code
      AND ac.ativo = true
      AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
      AND (ac.max_uses IS NULL OR ac.used_count < ac.max_uses);

    IF code_role IS NOT NULL THEN
      user_role := code_role;
      UPDATE public.access_codes
        SET used_count = used_count + 1
        WHERE codigo = p_code;
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
