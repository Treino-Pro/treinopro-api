-- Migration: presence_snapshot_unique
-- Description: Ensures unique snapshot per user/class and cleans up legacy duplicates keeping the earliest (closest to T0).

DO $$ 
BEGIN
    -- 1. Limpeza de duplicatas legadas
    -- Usamos captured_at ASC para preservar o PRIMEIRO registro (objetivo: T0 Evidence)
    DELETE FROM class_presence_snapshots
    WHERE id IN (
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY class_id, user_id 
                       ORDER BY captured_at ASC, created_at ASC
                   ) as row_num
            FROM class_presence_snapshots
        ) t
        WHERE t.row_num > 1
    );

    -- 2. Adição da constraint UNIQUE de forma robusta
    -- Verificamos se a constraint existe especificamente para esta tabela (conrelid)
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'class_presence_snapshots_class_id_user_id_unique'
          AND conrelid = 'class_presence_snapshots'::regclass
    ) THEN
        ALTER TABLE class_presence_snapshots 
        ADD CONSTRAINT class_presence_snapshots_class_id_user_id_unique UNIQUE(class_id, user_id);
    END IF;
END $$;
