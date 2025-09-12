-- Inicialização do banco de dados TreinoPRO
-- Este arquivo é executado automaticamente quando o container PostgreSQL é criado

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Criar enum para tipos de usuário
DO $$ BEGIN
    CREATE TYPE user_type AS ENUM ('student', 'personal');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para status de propostas
DO $$ BEGIN
    CREATE TYPE proposal_status AS ENUM ('pending', 'matched', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para status de aulas
DO $$ BEGIN
    CREATE TYPE class_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para tipos de registros financeiros
DO $$ BEGIN
    CREATE TYPE financial_type AS ENUM ('earning', 'payment', 'withdrawal');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Criar enum para status de registros financeiros
DO $$ BEGIN
    CREATE TYPE financial_status AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
