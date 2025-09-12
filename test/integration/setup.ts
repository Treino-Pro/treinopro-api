// Setup para testes de integração
import 'reflect-metadata';

// Configurações específicas para testes de integração
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-integration-tests';
process.env.JWT_EXPIRES_IN = '1h';
// Forçar uso do mock database para testes
process.env.DATABASE_URL = 'mock://test';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.PORT = '3001'; // Porta diferente para testes

// Configurar timeout maior para testes de integração
jest.setTimeout(30000);

// Mock de serviços externos que não queremos testar em integração
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  })),
}));

// Mock de upload de arquivos (se implementado)
jest.mock('multer', () => ({
  diskStorage: jest.fn(),
  memoryStorage: jest.fn(),
}));

console.log('🧪 Configuração de testes de integração carregada');
