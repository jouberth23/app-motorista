-- ============================
-- TaxiVoucher - Supabase Schema
-- ============================

-- ENUMS
CREATE TYPE app_role AS ENUM ('motorista', 'supervisor', 'admin');
CREATE TYPE trip_status AS ENUM ('rascunho', 'enviado', 'pendente', 'aprovado', 'recusado');
CREATE TYPE trip_type AS ENUM ('municipal', 'intermunicipal');
CREATE TYPE photo_type AS ENUM ('km_inicial', 'km_final');
CREATE TYPE signature_type AS ENUM ('motorista', 'passageiro');
CREATE TYPE approval_action AS ENUM ('aprovado', 'recusado');

-- PROFILES
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT,
  base TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER ROLES
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'motorista',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id)
);

-- TRIPS
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users ON DELETE RESTRICT,
  protocolo TEXT UNIQUE NOT NULL,
  status trip_status NOT NULL DEFAULT 'rascunho',
  data DATE NOT NULL,
  placa TEXT NOT NULL,
  base TEXT NOT NULL,
  tipo_viagem trip_type NOT NULL,
  hora_inicial TIME NOT NULL,
  hora_final TIME NOT NULL,
  hora_parada TEXT,
  km_inicial NUMERIC NOT NULL,
  km_final NUMERIC NOT NULL,
  total_km NUMERIC,
  inicio_base TEXT NOT NULL,
  final_base TEXT NOT NULL,
  embarque_empregado TEXT NOT NULL,
  desembarque_empregado TEXT NOT NULL,
  descricao_viagem TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  setor TEXT NOT NULL,
  valor_total NUMERIC,
  valor_definido_por UUID REFERENCES auth.users,
  valor_definido_em TIMESTAMPTZ,
  motivo_recusa TEXT,
  sent_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PASSENGERS
CREATE TABLE passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips ON DELETE CASCADE,
  nome TEXT NOT NULL,
  matricula TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PHOTOS
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips ON DELETE CASCADE,
  tipo photo_type NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SIGNATURES
CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips ON DELETE CASCADE,
  tipo signature_type NOT NULL,
  storage_path TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- APPROVALS
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips ON DELETE CASCADE,
  action approval_action NOT NULL,
  by_user UUID NOT NULL REFERENCES auth.users,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  by_user UUID REFERENCES auth.users,
  diff JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================
-- TRIGGERS
-- ============================

-- Auto create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)));

  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'motorista');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Calculate total_km automatically
CREATE OR REPLACE FUNCTION calculate_total_km()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.km_final IS NOT NULL AND NEW.km_inicial IS NOT NULL THEN
    NEW.total_km := NEW.km_final - NEW.km_inicial;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_total_km ON trips;
CREATE TRIGGER trg_calculate_total_km
  BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION calculate_total_km();

-- Prevent edit after send (except allowed fields)
CREATE OR REPLACE FUNCTION prevent_edit_after_send()
RETURNS TRIGGER AS $$
DECLARE
  allowed_fields TEXT[] := ARRAY[
    'status', 'valor_total', 'valor_definido_por', 'valor_definido_em',
    'motivo_recusa', 'approved_at', 'approved_by', 'updated_at'
  ];
  changed_field TEXT;
BEGIN
  IF OLD.status IN ('enviado', 'pendente', 'aprovado', 'recusado') THEN
    IF OLD.taxista IS DISTINCT FROM NEW.taxista THEN RAISE EXCEPTION 'Cannot edit sent trip'; END IF;
    IF OLD.placa IS DISTINCT FROM NEW.placa THEN RAISE EXCEPTION 'Cannot edit sent trip: placa'; END IF;
    IF OLD.km_inicial IS DISTINCT FROM NEW.km_inicial THEN RAISE EXCEPTION 'Cannot edit sent trip: km_inicial'; END IF;
    IF OLD.km_final IS DISTINCT FROM NEW.km_final THEN RAISE EXCEPTION 'Cannot edit sent trip: km_final'; END IF;
    IF OLD.justificativa IS DISTINCT FROM NEW.justificativa THEN RAISE EXCEPTION 'Cannot edit sent trip: justificativa'; END IF;
  END IF;

  -- Only central/admin can change valor_total
  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('supervisor', 'admin')
    ) THEN
      RAISE EXCEPTION 'Only supervisors and admins can set valor_total';
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_edit ON trips;
CREATE TRIGGER trg_prevent_edit
  BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION prevent_edit_after_send();

-- Audit log trigger for trips
CREATE OR REPLACE FUNCTION audit_trip_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (entity, entity_id, action, by_user, diff)
  VALUES (
    'trips',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    jsonb_build_object(
      'old', row_to_json(OLD),
      'new', row_to_json(NEW)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_trips ON trips;
CREATE TRIGGER trg_audit_trips
  AFTER INSERT OR UPDATE OR DELETE ON trips
  FOR EACH ROW EXECUTE FUNCTION audit_trip_changes();

-- ============================
-- HELPER FUNCTION
-- ============================

CREATE OR REPLACE FUNCTION has_role(user_id UUID, check_role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = $1
    AND user_roles.role = $2
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================
-- ROW LEVEL SECURITY
-- ============================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- User roles RLS
CREATE POLICY "Users can view roles" ON user_roles FOR SELECT USING (true);
CREATE POLICY "Admins can manage roles" ON user_roles FOR ALL USING (
  has_role(auth.uid(), 'admin')
);

-- Trips RLS
CREATE POLICY "Drivers see own trips" ON trips FOR SELECT USING (
  driver_id = auth.uid() OR
  has_role(auth.uid(), 'supervisor') OR
  has_role(auth.uid(), 'admin')
);

CREATE POLICY "Drivers can insert own trips" ON trips FOR INSERT WITH CHECK (
  driver_id = auth.uid()
);

CREATE POLICY "Drivers can update own draft trips" ON trips FOR UPDATE USING (
  driver_id = auth.uid() AND status = 'rascunho'
  OR has_role(auth.uid(), 'supervisor')
  OR has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete trips" ON trips FOR DELETE USING (
  has_role(auth.uid(), 'admin')
);

-- Passengers RLS
CREATE POLICY "Select passengers" ON passengers FOR SELECT USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND (
    trips.driver_id = auth.uid() OR
    has_role(auth.uid(), 'supervisor') OR
    has_role(auth.uid(), 'admin')
  ))
);
CREATE POLICY "Insert passengers" ON passengers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.driver_id = auth.uid())
);

-- Photos RLS
CREATE POLICY "Select photos" ON photos FOR SELECT USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND (
    trips.driver_id = auth.uid() OR
    has_role(auth.uid(), 'supervisor') OR
    has_role(auth.uid(), 'admin')
  ))
);
CREATE POLICY "Insert photos for draft trips" ON photos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND
    trips.driver_id = auth.uid() AND
    trips.status IN ('rascunho', 'enviado')
  )
);

-- Signatures RLS
CREATE POLICY "Select signatures" ON signatures FOR SELECT USING (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND (
    trips.driver_id = auth.uid() OR
    has_role(auth.uid(), 'supervisor') OR
    has_role(auth.uid(), 'admin')
  ))
);
CREATE POLICY "Insert signatures for draft trips" ON signatures FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND
    trips.driver_id = auth.uid() AND
    trips.status IN ('rascunho', 'enviado')
  )
);

-- Approvals RLS
CREATE POLICY "View approvals" ON approvals FOR SELECT USING (
  has_role(auth.uid(), 'supervisor') OR
  has_role(auth.uid(), 'admin') OR
  EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.driver_id = auth.uid())
);
CREATE POLICY "Insert approvals" ON approvals FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'admin')
);

-- Audit logs RLS
CREATE POLICY "Admins view audit logs" ON audit_logs FOR SELECT USING (
  has_role(auth.uid(), 'admin')
);
CREATE POLICY "System inserts audit logs" ON audit_logs FOR INSERT WITH CHECK (true);

-- ============================
-- STORAGE BUCKETS
-- ============================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('trip-photos', 'trip-photos', false, 10485760),
  ('signatures', 'signatures', false, 2097152),
  ('pdfs', 'pdfs', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users upload photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'trip-photos');

CREATE POLICY "Users view own photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'trip-photos');

CREATE POLICY "Authenticated users upload signatures"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'signatures');

CREATE POLICY "Users view signatures"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'signatures');

CREATE POLICY "Central view pdfs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pdfs');

CREATE POLICY "System insert pdfs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pdfs');
