#!/bin/bash

echo "🧪 Testando novo sistema de registro com campos obrigatórios"
echo "================================================================"

# Teste 1: Estudante adulto
echo "📝 Teste 1: Registro de estudante adulto"
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@email.com",
    "password": "123456",
    "firstName": "João",
    "lastName": "Silva",
    "phone": "11999999999",
    "birthDate": "1990-01-01",
    "userType": "student",
    "documentType": "RG",
    "documentNumber": "12345678901",
    "documentImageUrl": "https://example.com/rg-joao.jpg",
    "isMinor": false,
    "guardianConsent": false,
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'

echo -e "\n\n"

# Teste 2: Estudante menor de idade
echo "📝 Teste 2: Registro de estudante menor de idade"
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "maria@email.com",
    "password": "123456",
    "firstName": "Maria",
    "lastName": "Santos",
    "phone": "11988888888",
    "birthDate": "2010-05-15",
    "userType": "student",
    "documentType": "RG",
    "documentNumber": "98765432109",
    "documentImageUrl": "https://example.com/rg-maria.jpg",
    "isMinor": true,
    "guardianName": "Ana Santos",
    "guardianEmail": "ana@email.com",
    "guardianConsent": true,
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'

echo -e "\n\n"

# Teste 3: Personal Trainer
echo "📝 Teste 3: Registro de personal trainer"
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "personal@email.com",
    "password": "123456",
    "firstName": "Carlos",
    "lastName": "Personal",
    "phone": "11977777777",
    "birthDate": "1985-03-20",
    "userType": "personal",
    "documentType": "CNH",
    "documentNumber": "12345678901",
    "documentImageUrl": "https://example.com/cnh-carlos.jpg",
    "cref": "CREF: 0111212-9",
    "crefImageUrl": "https://example.com/cref-carlos.jpg",
    "specialties": ["Musculação", "Funcional", "Crossfit"],
    "isMinor": false,
    "guardianConsent": false,
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'

echo -e "\n\n"

# Teste 4: Erro - estudante sem campos obrigatórios
echo "❌ Teste 4: Erro - estudante sem campos obrigatórios"
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "erro@email.com",
    "password": "123456",
    "firstName": "Erro",
    "lastName": "Teste",
    "birthDate": "1990-01-01",
    "userType": "student",
    "isMinor": false,
    "guardianConsent": false,
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'

echo -e "\n\n"

# Teste 5: Erro - personal sem CREF
echo "❌ Teste 5: Erro - personal sem CREF"
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "erro2@email.com",
    "password": "123456",
    "firstName": "Erro",
    "lastName": "Personal",
    "birthDate": "1985-01-01",
    "userType": "personal",
    "documentType": "RG",
    "documentNumber": "12345678901",
    "documentImageUrl": "https://example.com/rg.jpg",
    "isMinor": false,
    "guardianConsent": false,
    "termsAccepted": true,
    "privacyPolicyAccepted": true
  }'

echo -e "\n\n"
echo "✅ Testes concluídos!"
