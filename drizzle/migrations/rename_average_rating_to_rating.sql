-- Adicionar campos de rating na tabela users
-- Todos os usuários começam com rating 5.0 (como no Uber)

-- Adicionar coluna rating se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'rating') THEN
    ALTER TABLE users ADD COLUMN rating NUMERIC(3, 2) DEFAULT 5.00;
    COMMENT ON COLUMN users.rating IS 'Rating médio do usuário (1-5). Todos começam com 5.0 como no Uber e o valor é atualizado automaticamente baseado nas avaliações recebidas.';
  END IF;
END $$;

-- Adicionar coluna total_ratings se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'users' AND column_name = 'total_ratings') THEN
    ALTER TABLE users ADD COLUMN total_ratings INTEGER DEFAULT 0;
    COMMENT ON COLUMN users.total_ratings IS 'Total de avaliações recebidas pelo usuário.';
  END IF;
END $$;

-- Se existir coluna average_rating, renomear para rating
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'users' AND column_name = 'average_rating') THEN
    ALTER TABLE users RENAME COLUMN average_rating TO rating;
  END IF;
END $$;

-- Atualizar usuários existentes que não têm rating definido
UPDATE users SET rating = 5.00 WHERE rating IS NULL;
UPDATE users SET total_ratings = 0 WHERE total_ratings IS NULL;
