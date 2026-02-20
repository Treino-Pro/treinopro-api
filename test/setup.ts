// Setup global para testes
import 'reflect-metadata';

// Mock console.log para reduzir ruído nos testes
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  // Silenciar logs durante os testes
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  // Restaurar console original
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Configurações globais para testes
global.console = {
  ...console,
  // Manter apenas os métodos que queremos
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Mock de variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRATION_TIME = '1h';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.PORT = '3000';
process.env.FEATURE_CODE_4_DIGITS = 'true';
process.env.FEATURE_45_MIN_RULE = 'true';
process.env.FEATURE_DISPUTE_DEFENSE = 'true';
