-- Backfill: copia users.fcmToken para user_push_tokens para usuários legados.
-- Após este migration, user_push_tokens é a única fonte de verdade para push routing.
-- Idempotente: ON CONFLICT DO NOTHING garante que tokens já migrados não são duplicados.

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
      'unknown',  -- plataforma não conhecida para tokens legados
      NULL,
      NOW(),
      NOW()
    FROM users u
    WHERE u.fcm_token IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_push_tokens t
        WHERE t.token = u.fcm_token
      );

    RAISE NOTICE 'Backfill de user_push_tokens concluido';
  END IF;
END $$;
