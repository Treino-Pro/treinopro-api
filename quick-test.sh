#!/bin/bash

echo "🧪 Teste Rápido da TreinoPRO API"
echo "================================"

# Teste 1: Health Check
echo "1. Testando Health Check..."
curl -s http://localhost:3000/health | jq . 2>/dev/null || echo "❌ Health check falhou"

echo ""

# Teste 2: Registro de Aluno (SEM CREF)
echo "2. Testando Registro de Aluno (sem CREF)..."
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aluno@teste.com",
    "password": "123456",
    "firstName": "João",
    "lastName": "Silva",
    "userType": "student"
  }' | jq . 2>/dev/null || echo "❌ Registro de aluno falhou"

echo ""

# Teste 3: Registro de Personal (COM CREF)
echo "3. Testando Registro de Personal (com CREF)..."
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "personal@teste.com",
    "password": "123456",
    "firstName": "Maria",
    "lastName": "Santos",
    "userType": "personal",
    "cref": "CREF: 0111212-9",
    "specialties": ["Musculação", "Funcional"]
  }' | jq . 2>/dev/null || echo "❌ Registro de personal falhou"

echo ""
echo "✅ Testes concluídos!"
