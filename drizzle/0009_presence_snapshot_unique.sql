-- Adiciona constraint UNIQUE(class_id, user_id) para garantir idempotência de snapshots de presença
-- Sem esta constraint, o race condition no createPresenceSnapshot pode gravar duplicatas
ALTER TABLE "class_presence_snapshots"
  ADD CONSTRAINT "class_presence_snapshots_class_id_user_id_unique" UNIQUE ("class_id", "user_id");
