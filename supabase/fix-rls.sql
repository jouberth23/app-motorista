-- Fix: add INSERT policies so the handle_new_user trigger can write profiles and user_roles
CREATE POLICY IF NOT EXISTS "Allow insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow insert user_roles" ON public.user_roles
  FOR INSERT WITH CHECK (true);

-- Fix: explicit search_path on trigger function to avoid schema resolution issues
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'motorista')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
