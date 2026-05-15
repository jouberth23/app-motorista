-- Migration: Create whatsapp_sends table for WhatsApp PDF sending audit trail

CREATE TABLE IF NOT EXISTS whatsapp_sends (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id              uuid REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  sent_by              uuid REFERENCES auth.users(id) NOT NULL,
  recipient_name       text,
  recipient_phone      text NOT NULL,
  recipient_kind       text DEFAULT 'manual',   -- 'manual' | 'driver' | 'supervisor'
  status               text DEFAULT 'pending',  -- 'sent' | 'failed' | 'pending'
  error_message        text,
  evolution_message_id text,
  extra_message        text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_sends ENABLE ROW LEVEL SECURITY;

-- Only supervisors and admins can see / insert sends
CREATE POLICY "central_manage_whatsapp_sends"
  ON whatsapp_sends FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('supervisor', 'admin')
    )
  );
