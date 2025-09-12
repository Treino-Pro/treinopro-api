import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { DatabaseModule } from '../../src/database/database.module';
import { UserType, DocumentType } from '../../src/modules/auth/dto/auth.dto';

// Mock do banco de dados para testes de integração
const mockDb = {
  query: {
    users: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
  insert: jest.fn(),
};

// Mock do JwtService
const mockJwtService = {
  sign: jest.fn(),
  signAsync: jest.fn(),
};

// Mock do ConfigService
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config = {
      JWT_SECRET: 'test-secret-key',
      JWT_EXPIRATION_TIME: '3600', // 1 hora em segundos
    };
    return config[key];
  }),
};

describe('Auth Integration Tests (Mock Database)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    // Configurar módulo de teste com mocks
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        DatabaseModule,
        AuthModule,
      ],
    })
    .overrideProvider('DATABASE_CONNECTION')
    .useValue(mockDb)
    .overrideProvider('JwtService')
    .useValue(mockJwtService)
    .overrideProvider('ConfigService')
    .useValue(mockConfigService)
    .compile();

    app = moduleRef.createNestApplication();
    
    // Configurar validação global
    app.useGlobalPipes(new (await import('@nestjs/common')).ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    // Configurar CORS
    app.enableCors({
      origin: 'http://localhost:3000',
      credentials: true,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  beforeEach(() => {
    // Reset mocks antes de cada teste
    jest.clearAllMocks();
    
    // Configurar mocks padrão
    mockJwtService.signAsync.mockResolvedValue('mock-access-token');
    mockJwtService.sign.mockReturnValue('mock-refresh-token');
    mockDb.query.users.findFirst.mockResolvedValue(null); // Usuário não existe por padrão
    mockDb.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([{
          id: 'mock-user-id',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          userType: 'student',
          createdAt: new Date(),
          updatedAt: new Date(),
        }])
      })
    });
    
    // Mock do bcrypt para login
    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);
  });

  describe('POST /auth/register', () => {
    it('deve registrar um estudante adulto com sucesso', async () => {
      const studentData = {
        email: 'joao@test.com',
        password: '123456',
        firstName: 'João',
        lastName: 'Silva',
        phone: '11999999999',
        birthDate: '1990-01-01',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg-joao.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(studentData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(studentData.email);
      expect(response.body.user.userType).toBe(UserType.STUDENT);
      
      // Verificar se o mock foi chamado corretamente
      expect(mockDb.query.users.findFirst).toHaveBeenCalledWith({
        where: expect.any(Function)
      });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('deve registrar um personal trainer com sucesso', async () => {
      const personalData = {
        email: 'personal@test.com',
        password: '123456',
        firstName: 'Carlos',
        lastName: 'Personal',
        phone: '11977777777',
        birthDate: '1985-03-20',
        userType: UserType.PERSONAL,
        documentType: DocumentType.CNH,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/cnh-carlos.jpg',
        cref: 'CREF: 0111212-9',
        crefImageUrl: 'https://example.com/cref-carlos.jpg',
        specialties: ['Musculação', 'Funcional'],
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(personalData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(personalData.email);
      expect(response.body.user.userType).toBe(UserType.PERSONAL);
    });

    it('deve registrar um estudante menor de idade com responsável', async () => {
      const minorData = {
        email: 'maria@test.com',
        password: '123456',
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '11988888888',
        birthDate: '2010-05-15',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '98765432109',
        documentImageUrl: 'https://example.com/rg-maria.jpg',
        isMinor: true,
        guardianName: 'Ana Santos',
        guardianEmail: 'ana@test.com',
        guardianConsent: true,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(minorData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(minorData.email);
    });

    it('deve retornar erro 400 para dados inválidos', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123', // Muito curta
        firstName: '',
        lastName: '',
        birthDate: 'invalid-date',
        userType: 'invalid-type',
        // Campos obrigatórios ausentes
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(Array.isArray(response.body.message)).toBe(true);
    });

    it('deve retornar erro 400 para personal sem CREF', async () => {
      const personalWithoutCref = {
        email: 'personal2@test.com',
        password: '123456',
        firstName: 'Personal',
        lastName: 'SemCref',
        birthDate: '1985-01-01',
        userType: UserType.PERSONAL,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
        // CREF ausente
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(personalWithoutCref)
        .expect(400);
    });

    it('deve retornar erro 409 para email duplicado', async () => {
      // Mock: usuário já existe
      mockDb.query.users.findFirst.mockResolvedValueOnce({
        id: 'existing-user-id',
        email: 'duplicate@test.com',
        firstName: 'Existing',
        lastName: 'User',
      });

      const userData = {
        email: 'duplicate@test.com',
        password: '123456',
        firstName: 'João',
        lastName: 'Silva',
        birthDate: '1990-01-01',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678901',
        documentImageUrl: 'https://example.com/rg.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(() => {
      // Mock: usuário existe para login
      mockDb.query.users.findFirst.mockResolvedValue({
        id: 'login-user-id',
        email: 'login@test.com',
        passwordHash: '$2a$12$mock.hash.for.testing',
        firstName: 'Login',
        lastName: 'Test',
        userType: 'student',
        isVerified: true,
      });
    });

    it('deve fazer login com credenciais válidas', async () => {
      const loginData = {
        email: 'login@test.com',
        password: '123456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(loginData.email);
    });

    it('deve retornar erro 401 para credenciais inválidas', async () => {
      const invalidLoginData = {
        email: 'login@test.com',
        password: 'wrong-password',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidLoginData)
        .expect(401);
    });

    it('deve retornar erro 401 para email inexistente', async () => {
      // Mock: usuário não existe
      mockDb.query.users.findFirst.mockResolvedValue(null);

      const nonExistentLoginData = {
        email: 'nonexistent@test.com',
        password: '123456',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(nonExistentLoginData)
        .expect(401);
    });
  });

  describe('Health Check', () => {
    it('deve retornar status de saúde da API', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
