-- Migration: Create in_app_notifications table
-- Description: Tabela para armazenar notificações in-app com persistência
-- Author: Antigravity AI
-- Date: 2025-11-27

--  Criar tabela de notificações in-app
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Criar índices para melhorar performance de queries
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id 
  ON in_app_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_created_at 
  ON in_app_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread 
  ON in_app_notifications(user_id, is_read) 
  WHERE is_read = FALSE;

-- Comentários das colunas para documentação
COMMENT ON TABLE in_app_notifications IS 'Armazena notificações in-app que aparecem dentro do aplicativo';
COMMENT ON COLUMN in_app_notifications.id IS 'ID único da notificação (formato: notif_timestamp_random)';
COMMENT ON COLUMN in_app_notifications.user_id IS 'ID do usuário que receberá a notificação';
COMMENT ON COLUMN in_app_notifications.title IS 'Título da notificação';
COMMENT ON COLUMN in_app_notifications.message IS 'Mensagem/corpo da notificação';
COMMENT ON COLUMN in_app_notifications.type IS 'Tipo de notificação: info, success, warning, error';
COMMENT ON COLUMN in_app_notifications.is_read IS 'Se a notificação foi lida pelo usuário';
COMMENT ON COLUMN in_app_notifications.data IS 'Dados adicionais em formato JSON (ação, IDs relacionados, etc)';
COMMENT ON COLUMN in_app_notifications.created_at IS 'Data/hora de criação da notificação';
