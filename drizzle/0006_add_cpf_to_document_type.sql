-- Migration: Add CPF to document_type enum
-- Date: 2026-02-15
-- Description: Adds 'CPF' as a valid value for the document_type enum

-- Add 'CPF' to the document_type enum
ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'CPF';
