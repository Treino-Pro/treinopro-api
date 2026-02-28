-- Garante índice único necessário para ON CONFLICT (user_push_tokens.token)
-- e remove duplicatas legadas, preservando o registro mais recente por token.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_push_tokens'
  ) THEN
    WITH ranked AS (
      SELECT
        ctid,
        row_number() OVER (
          PARTITION BY token
          ORDER BY last_used_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM user_push_tokens
    )
    DELETE FROM user_push_tokens t
    USING ranked r
    WHERE t.ctid = r.ctid
      AND r.rn > 1;

    CREATE UNIQUE INDEX IF NOT EXISTS user_push_tokens_token_unique
      ON user_push_tokens (token);
  END IF;
END $$;
