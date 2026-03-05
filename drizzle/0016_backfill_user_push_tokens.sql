-- Backfill: copia users.fcmToken para user_push_tokens para usuários legados.
-- Após este migration, user_push_tokens é a única fonte de verdade para push routing.
-- Idempotente:
--   1. NOT EXISTS evita inserir token já presente (funciona mesmo sem índice único)
--   2. ON CONFLICT (token) DO NOTHING é segunda camada (requer índice único da 0015)
-- IMPORTANTE: executar após 0015_ensure_user_push_tokens_token_unique.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_push_tokens'
  ) THEN
    INSERT INTO user_push_tokens (id, user_id, token, platform, device_info, created_at, last_used_at)
    SELECT
      gen_random_uuid(),
      u.id,
      u.fcm_token,
      'legacy',   -- marcador de origem para rastreabilidade
      'backfill', -- device_info indica que veio da migration
      NOW(),
      NOW()
    FROM users u
    WHERE u.fcm_token IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_push_tokens t
        WHERE t.token = u.fcm_token
      )
    ON CONFLICT (token) DO NOTHING;

    RAISE NOTICE 'Backfill de user_push_tokens concluido';
  END IF;
END $$;
