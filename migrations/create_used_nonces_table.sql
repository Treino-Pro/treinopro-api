-- Migration: Criar tabela used_nonces para prevenir replay attacks
-- Data: 2025-01-XX

CREATE TABLE IF NOT EXISTS used_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce VARCHAR(255) UNIQUE NOT NULL,
  proposal_id UUID NOT NULL,
  personal_id UUID NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_used_nonces_nonce ON used_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_used_nonces_proposal ON used_nonces(proposal_id);
CREATE INDEX IF NOT EXISTS idx_used_nonces_personal ON used_nonces(personal_id);

-- Comentários
COMMENT ON TABLE used_nonces IS 'Armazena nonces usados para prevenir replay attacks em notificações push';
COMMENT ON COLUMN used_nonces.nonce IS 'Nonce assinado único gerado para cada notificação';
COMMENT ON COLUMN used_nonces.proposal_id IS 'ID da proposta relacionada';
COMMENT ON COLUMN used_nonces.personal_id IS 'ID do personal trainer que usou o nonce';
COMMENT ON COLUMN used_nonces.used_at IS 'Timestamp de quando o nonce foi usado';

