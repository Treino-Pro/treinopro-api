import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { DatabaseModule } from '../../src/database/database.module';
import { HealthController } from '../../src/common/health/health.controller';
import { UserType, DocumentType } from '../../src/modules/auth/dto/auth.dto';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    // Configurar módulo de teste com dependências reais
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        DatabaseModule,
        AuthModule,
      ],
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    
    // Configurar validação global
    app.useGlobalPipes(new (await import('@nestjs/common')).ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    // Configurar CORS
    app.enableCors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await moduleRef.close();
  });

  beforeEach(async () => {
    // Limpar banco de dados antes de cada teste APENAS para este arquivo
    const db = moduleRef.get('DATABASE_CONNECTION');
    if (db) {
      try {
        // Verificar se é o banco real ou mock
        if (db.query && typeof db.query === 'function') {
          // Banco real - usar SQL direto
          await db.query('DELETE FROM users');
          console.log('🧹 [AUTH TEST] Banco de dados limpo para o teste');
        } else if (db.query && db.query.users && db.query.users.clear) {
          // Mock database - usar método clear
          db.query.users.clear();
          console.log('🧹 [AUTH TEST] Mock database limpo para o teste');
        }
      } catch (error) {
        console.log('⚠️ [AUTH TEST] Erro ao limpar banco:', error.message);
      }
    }
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
        cref: 'SP-106227',
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

      // Primeiro registro
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Segundo registro com mesmo email
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('deve fazer login com credenciais válidas após registro', async () => {
      // Primeiro, registrar o usuário
      const userData = {
        email: 'login@test.com',
        password: '123456',
        firstName: 'Login',
        lastName: 'Test',
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
        .expect(201);

      // Depois, fazer login
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
      // Primeiro, registrar o usuário
      const userData = {
        email: 'login2@test.com',
        password: '123456',
        firstName: 'Login2',
        lastName: 'Test',
        birthDate: '1990-01-01',
        userType: UserType.STUDENT,
        documentType: DocumentType.RG,
        documentNumber: '12345678902',
        documentImageUrl: 'https://example.com/rg.jpg',
        isMinor: false,
        guardianConsent: false,
        termsAccepted: true,
        privacyPolicyAccepted: true,
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Depois, tentar login com senha errada
      const invalidLoginData = {
        email: 'login2@test.com',
        password: 'wrong-password',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(invalidLoginData)
        .expect(401);
    });

    it('deve retornar erro 401 para email inexistente', async () => {
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

  describe('GET /health', () => {
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
