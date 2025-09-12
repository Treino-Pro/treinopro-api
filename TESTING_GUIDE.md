# 🧪 Guia Prático de Testes - TreinoPRO API

## 🚀 Início Rápido

### Pré-requisitos
```bash
# Node.js 18+ e Yarn instalados
node --version  # v18.0.0+
yarn --version  # 1.22.0+

# Dependências instaladas
yarn install
```

### Executar Todos os Testes
```bash
# Testes unitários (recomendado para desenvolvimento)
yarn test:unit

# Todos os testes (unitários + integração)
yarn test:all
```

## 📝 Testes Unitários

### Execução Básica
```bash
# Todos os testes unitários
yarn test:unit

# Apenas testes de autenticação
yarn test:auth

# Com cobertura de código
yarn test:cov

# Modo watch (re-executa ao salvar)
yarn test:watch
```

### Exemplo de Saída
```
✅ AuthService (15 testes)
  ✅ deve registrar um estudante adulto
  ✅ deve registrar um personal trainer
  ✅ deve validar CREF obrigatório
  ✅ deve validar idade para menores
  ✅ deve fazer login com credenciais válidas
  ...

✅ AuthController (8 testes)
  ✅ POST /auth/register deve retornar 201
  ✅ POST /auth/login deve retornar 200
  ...

✅ HealthController (3 testes)
  ✅ GET /health deve retornar status ok
  ...

✅ MockDatabase (8 testes)
  ✅ deve inserir usuário
  ✅ deve buscar usuário por email
  ...

📊 Cobertura: 57.7% statements, 46.37% branches
```

## 🔗 Testes de Integração

### Com Docker (Recomendado)
```bash
# Iniciar banco de teste
docker-compose -f docker-compose.test.yml up -d

# Executar testes de integração
yarn test:integration

# Parar banco de teste
docker-compose -f docker-compose.test.yml down
```

### Sem Docker (Mocks)
```bash
# Executar apenas testes com mocks
yarn test:integration --testPathPattern="mock"
```

### Exemplo de Saída
```
🚀 Iniciando setup global para testes de integração...
✅ Docker está disponível
✅ Banco de teste iniciado
✅ Setup global concluído

🧪 Configuração de testes de integração carregada

✅ Auth Integration Tests
  ✅ POST /auth/register deve registrar estudante
  ✅ POST /auth/register deve registrar personal trainer
  ✅ POST /auth/login deve fazer login
  ...

✅ Database Integration Tests
  ✅ deve conectar com banco de dados
  ✅ deve inserir usuário
  ✅ deve buscar usuário por email
  ...

🧹 Iniciando teardown global...
✅ Teardown global concluído
```

## 🎭 Trabalhando com Mocks e Stubs

### Entendendo Mocks
```typescript
// Mock do banco de dados
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(), // Simula busca de usuário
    },
  },
  insert: jest.fn(), // Simula inserção
};

// Configurar comportamento do mock
mockDb.query.users.findFirst.mockResolvedValue(null); // Usuário não existe
mockDb.insert.mockReturnValue({
  values: jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue([{ id: '1', email: 'test@example.com' }])
  })
});
```

### Entendendo Stubs
```typescript
// Stub do bcrypt para controlar validação de senha
jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);

// Stub do JWT para controlar geração de tokens
mockJwtService.signAsync.mockResolvedValue('mock-access-token');
```

### Criando Novos Testes
```typescript
describe('NovoMódulo', () => {
  let service: NovoService;
  let mockDependency: MockType;

  beforeEach(async () => {
    // 1. Configurar mocks
    mockDependency = {
      method: jest.fn(),
    };

    // 2. Criar módulo de teste
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NovoService,
        { provide: 'DEPENDENCY', useValue: mockDependency },
      ],
    }).compile();

    // 3. Obter instância do serviço
    service = module.get<NovoService>(NovoService);
  });

  it('deve executar ação com sucesso', async () => {
    // Arrange - Preparar dados
    const input = { data: 'test' };
    mockDependency.method.mockResolvedValue('expected-result');

    // Act - Executar ação
    const result = await service.execute(input);

    // Assert - Verificar resultado
    expect(result).toBe('expected-result');
    expect(mockDependency.method).toHaveBeenCalledWith(input);
  });
});
```

## 🔧 Configuração Avançada

### Jest Configuration
```javascript
// test/jest.config.js
module.exports = {
  displayName: 'TreinoPRO Unit Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
```

### Environment Variables
```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/treinopro_test
JWT_SECRET=test-secret-key
JWT_EXPIRATION_TIME=3600
```

## 🐛 Debugging de Testes

### Modo Debug
```bash
# Executar com debug
yarn test:debug

# Executar teste específico
yarn test:unit --testNamePattern="deve registrar usuário"
```

### Logs Detalhados
```typescript
// Adicionar logs nos testes
it('deve registrar usuário', async () => {
  console.log('🧪 Iniciando teste de registro');
  
  const result = await authService.register(userData);
  
  console.log('✅ Resultado:', result);
  expect(result).toHaveProperty('user');
});
```

### Breakpoints
```typescript
// Adicionar breakpoint
it('deve registrar usuário', async () => {
  debugger; // Breakpoint aqui
  
  const result = await authService.register(userData);
  expect(result).toHaveProperty('user');
});
```

## 📊 Análise de Cobertura

### Relatório HTML
```bash
# Gerar relatório de cobertura
yarn test:cov

# Abrir relatório no navegador
open coverage/index.html
```

### Interpretando Cobertura
```
📊 COBERTURA ATUAL
├── Statements: 57.7%  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
├── Branches:   46.37% ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
├── Functions:  46.51% ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
└── Lines:      60.3%  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

🎯 META: 80% em todas as métricas
```

### Melhorando Cobertura
1. **Identificar gaps**: Verificar relatório HTML
2. **Adicionar testes**: Para funções não cobertas
3. **Edge cases**: Testar cenários extremos
4. **Error paths**: Testar tratamento de erros

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Testes Falhando
```bash
# Verificar logs detalhados
yarn test:unit --verbose

# Executar teste específico
yarn test:unit --testNamePattern="nome do teste"
```

#### 2. Mocks Não Funcionando
```typescript
// Verificar se mock está configurado
console.log('Mock configurado:', mockDb.query.users.findFirst);

// Resetar mocks
jest.clearAllMocks();
```

#### 3. Banco de Dados
```bash
# Verificar se Docker está rodando
docker ps

# Reiniciar banco de teste
docker-compose -f docker-compose.test.yml down
docker-compose -f docker-compose.test.yml up -d
```

#### 4. Dependências
```bash
# Limpar cache do Jest
yarn test:unit --clearCache

# Reinstalar dependências
rm -rf node_modules
yarn install
```

### Logs de Debug
```typescript
// Habilitar logs detalhados
process.env.DEBUG = 'treinopro:*';

// Logs específicos do Jest
process.env.JEST_LOG_LEVEL = 'debug';
```

## 📚 Recursos Adicionais

### Documentação
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Supertest](https://github.com/visionmedia/supertest)

### Ferramentas
- **VS Code**: Jest extension para debugging
- **Chrome DevTools**: Para debug de testes
- **Coverage Reports**: HTML reports para análise

### Boas Práticas
1. **Nomenclatura clara**: Descrever o comportamento esperado
2. **AAA Pattern**: Arrange, Act, Assert
3. **Mocks isolados**: Um mock por teste
4. **Cleanup**: Limpar estado após cada teste
5. **Cobertura**: Manter acima de 80%

---

## 🆘 Suporte

### Problemas Técnicos
- **GitHub Issues**: Para bugs e melhorias
- **Documentação**: Este guia e arquivos de teste
- **Código**: Comentários nos arquivos de teste

### Contribuindo
1. **Fork** do repositório
2. **Criar branch** para feature
3. **Adicionar testes** para nova funcionalidade
4. **Executar testes** antes do commit
5. **Pull Request** com descrição clara

**📅 Última atualização**: Dezembro 2024  
**👨‍💻 Desenvolvido por**: Equipe TreinoPRO
