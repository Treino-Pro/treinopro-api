-- Migration: Adicionar novos valores ao enum class_dispute_status
-- Data: 2026-02-20
-- Descrição: Suporte a status derivado de defesa enviada

ALTER TYPE class_dispute_status ADD VALUE IF NOT EXISTS 'defense_submitted_by_student';
ALTER TYPE class_dispute_status ADD VALUE IF NOT EXISTS 'defense_submitted_by_personal';
