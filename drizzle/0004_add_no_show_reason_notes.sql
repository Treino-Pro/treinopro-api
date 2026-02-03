-- Descrição/motivo ao criar disputa de no-show (aluno ou personal)
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "no_show_reason" text;
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "no_show_notes" text;
