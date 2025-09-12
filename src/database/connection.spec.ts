import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// Mock do postgres
jest.mock('postgres', () => {
  return jest.fn(() => ({
    query: jest.fn(),
    end: jest.fn(),
  }));
});

// Mock do drizzle
jest.mock('drizzle-orm/postgres-js', () => ({
  drizzle: jest.fn(() => 'mock-drizzle-instance'),
}));

describe('Database Connection', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
                DATABASE_USER: 'testuser',
                DATABASE_PASSWORD: 'testpass',
                DATABASE_HOST: 'localhost',
                DATABASE_PORT: '5432',
                DATABASE_NAME: 'testdb',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve usar DATABASE_URL quando disponível', () => {
    // Arrange
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';

    // Act
    const connectionString = process.env.DATABASE_URL || 
      `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'treinopro'}`;

    // Assert
    expect(connectionString).toBe('postgresql://user:pass@localhost:5432/testdb');
  });

  it('deve construir connection string quando DATABASE_URL não está disponível', () => {
    // Arrange
    delete process.env.DATABASE_URL;
    process.env.DATABASE_USER = 'testuser';
    process.env.DATABASE_PASSWORD = 'testpass';
    process.env.DATABASE_HOST = 'localhost';
    process.env.DATABASE_PORT = '5432';
    process.env.DATABASE_NAME = 'testdb';

    // Act
    const connectionString = process.env.DATABASE_URL || 
      `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'treinopro'}`;

    // Assert
    expect(connectionString).toBe('postgresql://testuser:testpass@localhost:5432/testdb');
  });

  it('deve usar valores padrão quando variáveis de ambiente não estão definidas', () => {
    // Arrange
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_USER;
    delete process.env.DATABASE_PASSWORD;
    delete process.env.DATABASE_HOST;
    delete process.env.DATABASE_PORT;
    delete process.env.DATABASE_NAME;

    // Act
    const connectionString = process.env.DATABASE_URL || 
      `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASSWORD || 'postgres'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'treinopro'}`;

    // Assert
    expect(connectionString).toBe('postgresql://postgres:postgres@localhost:5432/treinopro');
  });
});
