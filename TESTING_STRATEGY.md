# 🧪 Estratégia de Testes - TreinoPRO API

## 📋 Visão Geral

Este documento descreve a estratégia completa de testes implementada para a API TreinoPRO, incluindo testes unitários, de integração e as práticas de mocks e stubs utilizadas.

## 🎯 Objetivos da Estratégia

- **Qualidade**: Garantir que todas as funcionalidades funcionem corretamente
- **Confiabilidade**: Reduzir bugs em produção
- **Manutenibilidade**: Facilitar refatorações e mudanças
- **Documentação**: Servir como documentação viva do código
- **CI/CD**: Suportar integração contínua e deploy automatizado

## 🏗️ Arquitetura de Testes

### 1. Testes Unitários (Unit Tests)
**Localização**: `test/`  
**Configuração**: `test/jest.config.js`  
**Cobertura**: 57.7% (34 testes passando)

#### Características:
- ✅ **Isolados**: Cada teste é independente
- ✅ **Rápidos**: Executam em milissegundos
- ✅ **Confiáveis**: Sem dependências externas
- ✅ **Detalhados**: Testam funções específicas

#### Estrutura:
```
test/
├── jest.config.js              # Configuração Jest
├── auth.service.spec.ts        # Testes do AuthService
├── auth.controller.spec.ts     # Testes do AuthController
├── health.controller.spec.ts   # Testes do HealthController
└── mock-db.spec.ts            # Testes do MockDatabase
```

### 2. Testes de Integração (Integration Tests)
**Localização**: `test/integration/`  
**Configuração**: `test/integration/jest.config.js`  
**Status**: Estrutura implementada

#### Características:
- 🔗 **End-to-end**: Testam fluxos completos
- 🌐 **Realistas**: Simulam requisições HTTP reais
- 🗄️ **Banco de dados**: Testam operações de banco
- 🔄 **Cenários complexos**: Validações de negócio

#### Estrutura:
```
test/integration/
├── jest.config.js                    # Configuração Jest para integração
├── setup.ts                         # Setup global
├── global-setup.ts                  # Setup inicial (Docker)
├── global-teardown.ts               # Limpeza final
├── auth.integration.spec.ts         # Testes com banco real
├── auth-mock.integration.spec.ts    # Testes com mocks
└── database.integration.spec.ts     # Testes de banco
```

## 🎭 Estratégia de Mocks e Stubs

### Mocks (Simulações)
**Definição**: Objetos que simulam o comportamento de dependências reais

#### 1. Mock do Banco de Dados
```typescript
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
  insert: jest.fn(),
};
```

**Uso**: Simula operações de banco sem conexão real

#### 2. Mock do JWT Service
```typescript
const mockJwtService = {
  sign: jest.fn(),
  signAsync: jest.fn(),
};
```

**Uso**: Simula geração de tokens JWT

#### 3. Mock do Config Service
```typescript
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config = {
      JWT_SECRET: 'test-secret-key',
      JWT_EXPIRATION_TIME: '3600',
    };
    return config[key];
  }),
};
```

**Uso**: Simula configurações de ambiente

### Stubs (Controle de Comportamento)
**Definição**: Funções que controlam o comportamento de dependências

#### 1. Stub do bcrypt
```typescript
jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
```

**Uso**: Controla validação de senhas

#### 2. Stub de Validação
```typescript
mockDb.query.users.findFirst.mockResolvedValue(null);
```

**Uso**: Controla se usuário existe ou não

## 📊 Cobertura de Testes

### Testes Unitários (✅ Implementados)

#### AuthService (15 testes)
- ✅ Registro de estudante adulto
- ✅ Registro de personal trainer
- ✅ Registro de menor de idade
- ✅ Validações de CREF
- ✅ Validações de idade
- ✅ Validações de termos
- ✅ Login com credenciais válidas
- ✅ Login com credenciais inválidas
- ✅ Tratamento de erros

#### AuthController (8 testes)
- ✅ Endpoint de registro
- ✅ Endpoint de login
- ✅ Endpoint de refresh token
- ✅ Endpoint de mudança de senha
- ✅ Tratamento de erros HTTP

#### HealthController (3 testes)
- ✅ Status da API
- ✅ Timestamp
- ✅ Versão

#### MockDatabase (8 testes)
- ✅ Inserção de usuários
- ✅ Busca de usuários
- ✅ Validações de dados

### Testes de Integração (🔄 Estrutura Implementada)

#### Autenticação Completa
- 🔄 Registro via HTTP
- 🔄 Login via HTTP
- 🔄 Validações de negócio
- 🔄 Tratamento de erros

#### Banco de Dados
- 🔄 Conexão real
- 🔄 Operações CRUD
- 🔄 Validações de schema
- 🔄 Transações

## 🚀 Scripts de Teste

### Comandos Disponíveis
```bash
# Testes Unitários
yarn test:unit              # Todos os testes unitários
yarn test:auth              # Apenas testes de autenticação
yarn test:cov               # Com cobertura de código

# Testes de Integração
yarn test:integration       # Todos os testes de integração
yarn test:integration:auth  # Apenas testes de auth
yarn test:integration:db    # Apenas testes de banco

# Todos os Testes
yarn test:all              # Unitários + Integração
```

### Configurações
```bash
# Executar com verbose
yarn test:unit --verbose

# Executar com watch
yarn test:unit --watch

# Executar com debug
yarn test:unit --debug
```

## 🛠️ Ferramentas Utilizadas

### Jest
- **Framework**: Jest para execução de testes
- **Configuração**: Múltiplos arquivos de config
- **Cobertura**: Relatórios detalhados
- **Mocks**: Sistema nativo de mocks

### Supertest
- **HTTP Testing**: Testes de endpoints
- **Integração**: Simulação de requisições
- **Assertions**: Validações de resposta

### Drizzle ORM
- **Banco de dados**: Operações de banco
- **Migrations**: Controle de schema
- **Types**: TypeScript nativo

## 📈 Métricas de Qualidade

### Cobertura Atual
- **Statements**: 57.7%
- **Branches**: 46.37%
- **Functions**: 46.51%
- **Lines**: 60.3%

### Meta de Cobertura
- **Mínimo**: 80% em todas as métricas
- **Ideal**: 90%+ para código crítico

### Testes por Funcionalidade
- **Autenticação**: 23 testes
- **Health Check**: 3 testes
- **Banco de Dados**: 8 testes
- **Total**: 34 testes unitários

## 🔧 Configuração de Ambiente

### Desenvolvimento
```bash
# Instalar dependências
yarn install

# Executar testes unitários
yarn test:unit

# Executar com cobertura
yarn test:cov
```

### Integração
```bash
# Iniciar banco de teste
docker-compose -f docker-compose.test.yml up -d

# Executar testes de integração
yarn test:integration

# Parar banco de teste
docker-compose -f docker-compose.test.yml down
```

## 📝 Convenções de Teste

### Nomenclatura
- **Arquivos**: `*.spec.ts` para unitários, `*.integration.spec.ts` para integração
- **Describes**: Descrevem o componente sendo testado
- **Its**: Descrevem o comportamento específico

### Estrutura AAA
```typescript
it('deve registrar um usuário com sucesso', async () => {
  // Arrange - Preparar dados
  const userData = { email: 'test@example.com' };
  
  // Act - Executar ação
  const result = await authService.register(userData);
  
  // Assert - Verificar resultado
  expect(result).toHaveProperty('user');
});
```

### Mocks e Stubs
- **beforeEach**: Resetar mocks antes de cada teste
- **afterEach**: Limpar estado após cada teste
- **describe**: Agrupar testes relacionados

## 🚨 Tratamento de Erros

### Testes Unitários
- **Mocks**: Simulam falhas controladas
- **Assertions**: Verificam exceções esperadas
- **Isolamento**: Erros não afetam outros testes

### Testes de Integração
- **Banco real**: Tratamento de erros de conexão
- **HTTP**: Validação de status codes
- **Validação**: Dados inválidos e edge cases

## 🔄 CI/CD Integration

### Pipeline de Testes
1. **Lint**: Verificar qualidade do código
2. **Unit Tests**: Executar testes unitários
3. **Integration Tests**: Executar testes de integração
4. **Coverage**: Verificar cobertura mínima
5. **Build**: Compilar aplicação

### Critérios de Aprovação
- ✅ Todos os testes unitários passando
- ✅ Cobertura mínima de 80%
- ✅ Sem erros de lint
- ✅ Build bem-sucedido

## 📚 Recursos Adicionais

### Documentação
- **README**: Instruções de setup
- **API Docs**: Documentação Swagger
- **Code Comments**: Comentários no código

### Ferramentas de Debug
- **Jest Debug**: `yarn test:debug`
- **Console Logs**: Logs detalhados nos testes
- **Coverage Reports**: Relatórios HTML

## 🎯 Próximos Passos

### Melhorias Planejadas
1. **Aumentar cobertura** para 80%+
2. **Testes E2E** com Cypress/Playwright
3. **Performance tests** com Artillery
4. **Security tests** com OWASP ZAP

### Novos Testes
1. **Módulos restantes** (Proposals, Classes, etc.)
2. **WebSocket tests** para chat em tempo real
3. **File upload tests** para documentos
4. **Email tests** para notificações

---

## 📞 Suporte

Para dúvidas sobre a estratégia de testes:
- **Documentação**: Este arquivo
- **Código**: Comentários nos arquivos de teste
- **Issues**: GitHub Issues para problemas

**Última atualização**: Dezembro 2024  
**Versão**: 1.0.0
