-- Migração segura para adicionar 'admin' ao enum user_type
-- Este script verifica se o valor já existe antes de tentar adicionar

-- Verificar se 'admin' já existe no enum
DO $$
BEGIN
    -- Tentar adicionar 'admin' ao enum, ignorando erro se já existir
    BEGIN
        ALTER TYPE user_type ADD VALUE 'admin';
        RAISE NOTICE 'Valor "admin" adicionado ao enum user_type com sucesso';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'Valor "admin" já existe no enum user_type';
        WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao adicionar valor "admin" ao enum user_type: %', SQLERRM;
    END;
END $$;

-- Verificar os valores atuais do enum
SELECT unnest(enum_range(NULL::user_type)) as user_types ORDER BY user_types;
