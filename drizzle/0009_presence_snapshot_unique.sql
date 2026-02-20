-- Migration: presence_snapshot_unique
-- Description: Cleans orphans, deduplicates based on best evidence, and enforces referential integrity.

DO $$ 
BEGIN
    -- 1. Limpeza de snapshots órfãos (onde a aula ou usuário não existem mais)
    DELETE FROM class_presence_snapshots
    WHERE class_id NOT IN (SELECT id FROM classes)
       OR user_id NOT IN (SELECT id FROM users);

    -- 2. Limpeza de duplicatas legadas baseada em QUALIDADE de evidência
    DELETE FROM class_presence_snapshots
    WHERE id IN (
        SELECT id
        FROM (
            SELECT s.id,
                   ROW_NUMBER() OVER (
                       PARTITION BY s.class_id, s.user_id 
                       ORDER BY 
                           -- 1º: Proximidade absoluta ao horário agendado (T0)
                           ABS(EXTRACT(EPOCH FROM (s.captured_at - (c.date::date + c.time::time)))) ASC,
                           -- 2º: Melhor precisão (menor erro em metros)
                           s.accuracy_meters ASC NULLS LAST,
                           -- 3º: Desempate determinístico por criação e ID
                           s.created_at ASC,
                           s.id ASC
                   ) as row_num
            FROM class_presence_snapshots s
            JOIN classes c ON s.class_id = c.id
        ) t
        WHERE t.row_num > 1
    );

    -- 3. Adição da constraint UNIQUE de forma robusta
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'class_presence_snapshots_class_id_user_id_unique'
          AND conrelid = 'class_presence_snapshots'::regclass
    ) THEN
        ALTER TABLE class_presence_snapshots 
        ADD CONSTRAINT class_presence_snapshots_class_id_user_id_unique UNIQUE(class_id, user_id);
    END IF;

    -- 4. Adição de Foreign Keys para garantir integridade referencial
    
    -- FK para classes
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'class_presence_snapshots_class_id_classes_id_fk'
          AND conrelid = 'class_presence_snapshots'::regclass
    ) THEN
        ALTER TABLE class_presence_snapshots 
        ADD CONSTRAINT class_presence_snapshots_class_id_classes_id_fk 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;

    -- FK para users
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'class_presence_snapshots_user_id_users_id_fk'
          AND conrelid = 'class_presence_snapshots'::regclass
    ) THEN
        ALTER TABLE class_presence_snapshots 
        ADD CONSTRAINT class_presence_snapshots_user_id_users_id_fk 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

END $$;
