import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { ClassesModule } from '../../src/modules/classes/classes.module';
import { DatabaseModule } from '../../src/database/database.module';
import { client } from '../../src/database/connection';
import { users, proposals, classes } from '../../src/database/schema';
import { eq } from 'drizzle-orm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

describe('Classes Integration (45min, 4-digit code, 2h cancel)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let db: any;
  let jwtService: JwtService;

  let studentToken: string;
  let personalToken: string;
  let studentId: string;
  let personalId: string;
  let proposalId: string;
  let classId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        DatabaseModule,
        AuthModule,
        ClassesModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    
    db = moduleRef.get('DATABASE_CONNECTION');
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    if (client) await client.end();
    await app.close();
  });

  beforeEach(async () => {
    // Limpar dados
    await db.delete(classes);
    await db.delete(proposals);
    await db.delete(users);

    // Criar usuários e gerar tokens
    const studentData = {
      email: 'student@test.com',
      passwordHash: 'hash',
      userType: 'student',
      firstName: 'Student',
      lastName: 'Test',
      birthDate: new Date('2000-01-01'),
      documentType: 'CPF',
      documentNumber: '12345678901',
      termsAccepted: true,
      privacyPolicyAccepted: true,
    };
    const [student] = await db.insert(users).values(studentData).returning();
    studentId = student.id;
    studentToken = jwtService.sign({ sub: studentId, email: student.email, role: 'student' });

    const personalData = {
      email: 'personal@test.com',
      passwordHash: 'hash',
      userType: 'personal',
      firstName: 'Personal',
      lastName: 'Test',
      birthDate: new Date('1990-01-01'),
      documentType: 'CPF',
      documentNumber: '98765432109',
      termsAccepted: true,
      privacyPolicyAccepted: true,
      approvalStatus: 'approved',
    };
    const [personal] = await db.insert(users).values(personalData).returning();
    personalId = personal.id;
    personalToken = jwtService.sign({ sub: personalId, email: personal.email, role: 'personal' });

    // Criar proposta aceita
    const [proposal] = await db.insert(proposals).values({
      studentId,
      personalId,
      modalityId: crypto.randomUUID(),
      modalityName: 'Musculação',
      value: '100.00',
      status: 'accepted',
      description: 'Teste',
      location: 'Academia',
    }).returning();
    proposalId = proposal.id;

    // Criar aula agendada para hoje
    const now = new Date();
    const [classEntry] = await db.insert(classes).values({
      proposalId,
      studentId,
      personalId,
      location: 'Academia',
      date: now,
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      duration: 60,
      status: 'scheduled',
    }).returning();
    classId = classEntry.id;
  });

  it('deve iniciar aula e retornar código de 4 dígitos para o personal', async () => {
    const response = await request(app.getHttpServer())
      .post(`/classes/${classId}/start`)
      .set('Authorization', `Bearer ${personalToken}`)
      .expect(201);

    expect(response.body).toHaveProperty('startConfirmationCode');
    expect(response.body.startConfirmationCode).toHaveLength(4);
    expect(response.body.status).toBe('pending_confirmation');
  });

  it('deve falhar ao confirmar início com código incorreto', async () => {
    await request(app.getHttpServer())
      .post(`/classes/${classId}/start`)
      .set('Authorization', `Bearer ${personalToken}`);

    await request(app.getHttpServer())
      .post(`/classes/${classId}/confirm-start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ confirmed: true, confirmationCode: '9999' })
      .expect(400);
  });

  it('deve confirmar início com código correto e definir minimumCompletionAt', async () => {
    const startRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/start`)
      .set('Authorization', `Bearer ${personalToken}`);
    
    const code = startRes.body.startConfirmationCode;

    const response = await request(app.getHttpServer())
      .post(`/classes/${classId}/confirm-start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ confirmed: true, confirmationCode: code })
      .expect(201);

    expect(response.body.status).toBe('active');
    expect(response.body).toHaveProperty('minimumCompletionAt');
    
    const minAt = new Date(response.body.minimumCompletionAt);
    const startedAt = new Date(response.body.startedAt);
    expect(minAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime() + 45 * 60 * 1000);
  });

  it('deve bloquear finalização de aula antes de 45 minutos', async () => {
    // Iniciar e confirmar
    const startRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/start`)
      .set('Authorization', `Bearer ${personalToken}`);
    await request(app.getHttpServer())
      .post(`/classes/${classId}/confirm-start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ confirmed: true, confirmationCode: startRes.body.startConfirmationCode });

    // Tentar finalizar imediatamente
    const response = await request(app.getHttpServer())
      .post(`/classes/${classId}/complete`)
      .set('Authorization', `Bearer ${personalToken}`)
      .send({ notes: 'Terminei cedo' })
      .expect(400);

    expect(response.body.message).toContain('pelo menos 45 minutos');
  });

  it('deve bloquear cancelamento pelo aluno a menos de 2h do início', async () => {
    // Definir aula para daqui a 1 hora
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(classes).set({
      date: inOneHour,
      time: `${inOneHour.getHours().toString().padStart(2, '0')}:${inOneHour.getMinutes().toString().padStart(2, '0')}`,
    }).where(eq(classes.id, classId));

    const response = await request(app.getHttpServer())
      .post(`/classes/${classId}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(400);

    expect(response.body.message).toContain('até 2 horas antes');
  });
});
