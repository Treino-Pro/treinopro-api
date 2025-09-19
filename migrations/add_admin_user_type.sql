-- Migração para adicionar 'admin' ao enum user_type
-- Execute este script no banco de dados PostgreSQL

-- Adicionar 'admin' ao enum user_type
ALTER TYPE user_type ADD VALUE 'admin';

-- Verificar se foi adicionado corretamente
SELECT unnest(enum_range(NULL::user_type)) as user_types;
