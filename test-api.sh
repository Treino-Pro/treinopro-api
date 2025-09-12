#!/bin/bash

echo "🧪 Testando TreinoPRO API..."

# Teste 1: Health Check
echo "1. Testando Health Check..."
curl -s http://localhost:3000/health | jq . || echo "❌ Health check falhou"

echo ""

# Teste 2: Documentação Swagger
echo "2. Testando Documentação Swagger..."
curl -s -I http://localhost:3000/api/docs | head -1 || echo "❌ Swagger não acessível"

echo ""

# Teste 3: Registro de Aluno
echo "3. Testando Registro de Aluno..."
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aluno@teste.com",
    "password": "123456",
    "firstName": "João",
    "lastName": "Silva",
    "userType": "student"
  }' | jq . || echo "❌ Registro de aluno falhou"

echo ""

# Teste 4: Registro de Personal Trainer
echo "4. Testando Registro de Personal Trainer..."
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
  }' | jq . || echo "❌ Registro de personal falhou"

echo ""

# Teste 5: Login
echo "5. Testando Login..."
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "aluno@teste.com",
    "password": "123456"
  }' | jq . || echo "❌ Login falhou"

echo ""
echo "✅ Testes concluídos!"
