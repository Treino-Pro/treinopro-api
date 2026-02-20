-- Etapa 1: Remover duplicatas de forma inteligente, mantendo o registro mais recente e preciso.
-- Isso garante que a melhor evidência de snapshot seja preservada.
WITH duplicates AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER(
      PARTITION BY class_id,
      user_id
      ORDER BY
        captured_at DESC,
        accuracy_meters ASC NULLS LAST,
        ctid DESC
    ) as rn
  FROM
    "class_presence_snapshots"
)
DELETE FROM "class_presence_snapshots"
WHERE ctid IN (
    SELECT ctid
    FROM duplicates
    WHERE rn > 1
  );
-- Etapa 2: Adicionar a constraint UNIQUE de forma segura com "IF NOT EXISTS".
-- Isso previne que a migração falhe se a constraint já existir.
DO $$
BEGIN IF NOT EXISTS (
  SELECT 1
  FROM pg_constraint
  WHERE conname = 'class_presence_snapshots_class_id_user_id_unique'
) THEN
ALTER TABLE "class_presence_snapshots"
ADD CONSTRAINT "class_presence_snapshots_class_id_user_id_unique" UNIQUE ("class_id", "user_id");
END IF;
END;
$$;

