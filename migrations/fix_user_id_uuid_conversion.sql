-- Migration: Fix user_id column type conversion to UUID
-- Description: Converte colunas user_id que não são UUID para UUID usando conversão explícita
-- Date: 2025-01-XX
-- 
-- Este script identifica e corrige colunas user_id que não podem ser convertidas
-- automaticamente para UUID pelo PostgreSQL.
-- 
-- IMPORTANTE: Execute este script ANTES de rodar `yarn db:push` se você receber
-- o erro: "column user_id cannot be cast automatically to type uuid"

-- Primeiro, vamos identificar qual tabela tem o problema
DO $$
DECLARE
    r RECORD;
    problematic_tables TEXT := '';
BEGIN
    RAISE NOTICE '=== Identificando tabelas com user_id não-UUID ===';
    
    FOR r IN 
        SELECT 
            table_name,
            data_type
        FROM information_schema.columns
        WHERE column_name = 'user_id'
        AND table_schema = 'public'
        AND data_type != 'uuid'
        ORDER BY table_name
    LOOP
        problematic_tables := problematic_tables || r.table_name || ' (' || r.data_type || '), ';
        RAISE NOTICE 'Tabela problemática encontrada: % (tipo atual: %)', r.table_name, r.data_type;
    END LOOP;
    
    IF problematic_tables = '' THEN
        RAISE NOTICE 'Nenhuma tabela com user_id não-UUID encontrada. Todas as colunas já estão como UUID.';
    ELSE
        RAISE NOTICE 'Tabelas que precisam de conversão: %', problematic_tables;
    END IF;
END $$;

-- Agora, vamos converter todas as colunas user_id que não são UUID
DO $$
DECLARE
    r RECORD;
    sql_text TEXT;
    converted_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== Iniciando conversão de colunas user_id ===';
    
    FOR r IN 
        SELECT 
            table_name,
            column_name,
            data_type
        FROM information_schema.columns
        WHERE column_name = 'user_id'
        AND table_schema = 'public'
        AND data_type != 'uuid'
        ORDER BY table_name
    LOOP
        -- Constrói o comando ALTER TABLE com USING para conversão explícita
        -- Isso força o PostgreSQL a converter o valor usando a função de cast
        sql_text := format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE uuid USING %I::uuid',
            'public',
            r.table_name,
            r.column_name,
            r.column_name
        );
        
        -- Executa o comando
        BEGIN
            EXECUTE sql_text;
            converted_count := converted_count + 1;
            RAISE NOTICE '✓ Convertida coluna user_id na tabela % (de % para uuid)', 
                r.table_name, r.data_type;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '✗ Falha ao converter user_id na tabela %: %', r.table_name, SQLERRM;
            RAISE WARNING '  Detalhes: %', SQLSTATE;
        END;
    END LOOP;
    
    IF converted_count > 0 THEN
        RAISE NOTICE '=== Conversão concluída: % coluna(s) convertida(s) ===', converted_count;
    ELSE
        RAISE NOTICE '=== Nenhuma conversão necessária ===';
    END IF;
END $$;

-- Verificação final: lista todas as colunas user_id e seus tipos
DO $$
DECLARE
    r RECORD;
    total_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== Verificação final de colunas user_id ===';
    
    FOR r IN 
        SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable
        FROM information_schema.columns
        WHERE column_name = 'user_id'
        AND table_schema = 'public'
        ORDER BY table_name
    LOOP
        total_count := total_count + 1;
        RAISE NOTICE 'Tabela: % | Tipo: % | Nullable: %', 
            r.table_name, r.data_type, r.is_nullable;
    END LOOP;
    
    RAISE NOTICE 'Total de colunas user_id encontradas: %', total_count;
END $$;

