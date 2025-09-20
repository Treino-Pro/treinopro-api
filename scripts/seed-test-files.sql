-- Script para inserir arquivos de teste na tabela files
-- Execute este script antes de testar o registro de usuários

-- Inserir arquivo de documento de teste
INSERT INTO files (
    id,
    original_name,
    stored_name,
    mime_type,
    size,
    path,
    url,
    category,
    is_processed,
    metadata,
    created_at,
    updated_at
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'documento-teste.jpg',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
    'image/jpeg',
    1024,
    '/storage/images/documents/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
    'https://api.treinopro.com/static/images/documents/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
    'document',
    true,
    '{"description": "Documento de teste para registro"}',
    NOW(),
    NOW()
);

-- Inserir arquivo CREF de teste
INSERT INTO files (
    id,
    original_name,
    stored_name,
    mime_type,
    size,
    path,
    url,
    category,
    is_processed,
    metadata,
    created_at,
    updated_at
) VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    'cref-teste.jpg',
    'b2c3d4e5-f6a7-8901-bcde-f23456789012.jpg',
    'image/jpeg',
    2048,
    '/storage/images/documents/b2c3d4e5-f6a7-8901-bcde-f23456789012.jpg',
    'https://api.treinopro.com/static/images/documents/b2c3d4e5-f6a7-8901-bcde-f23456789012.jpg',
    'document',
    true,
    '{"description": "CREF de teste para registro"}',
    NOW(),
    NOW()
);

-- Verificar se os arquivos foram inseridos
SELECT id, original_name, category FROM files WHERE id IN (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'b2c3d4e5-f6a7-8901-bcde-f23456789012'
);
