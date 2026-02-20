import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { ClassesModule } from '../../src/modules/classes/classes.module';
import { DatabaseModule } from '../../src/database/database.module';
import { users, proposals, classes, classPresenceSnapshots, payments } from '../../src/database/schema';
import { eq, and } from 'drizzle-orm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { getQueueToken } from '@nestjs/bull';
import { EmailService } from '../../src/modules/notifications/services/email.service';
import { FirebaseNotificationService } from '../../src/modules/notifications/services/firebase-notification.service';
import { MercadoPagoService } from '../../src/modules/payments/mercadopago.service';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminService } from '../../src/modules/admin/admin.service';

// Mock robusto em memória
const memoryDB = {
  users: new Map(),
  proposals: new Map(),
  classes: new Map(),
  payments: new Map(),
  classPresenceSnapshots: new Map(),
};

const mockDbProvider = {
  query: {
    users: {
      findFirst: async ({ where }: any) => memoryDB.users.get(where.id.value),
    },
    classes: {
      findFirst: async ({ where }: any) => memoryDB.classes.get(where.id.value),
    },
    // Adicionar outros conforme necessário
  },
  insert: (table: any) => ({
    values: (data: any) => ({
      returning: async () => {
        const id = crypto.randomUUID();
        const record = { id, ...data };
        if (table.name === 'users') memoryDB.users.set(id, record);
        if (table.name === 'proposals') memoryDB.proposals.set(id, record);
        if (table.name === 'classes') memoryDB.classes.set(id, record);
        if (table.name === 'payments') memoryDB.payments.set(id, record);
        return [record];
      },
    }),
  }),
  update: (table: any) => ({
    set: (data: any) => ({
      where: ({ id }: any) => ({
        returning: async () => {
          if (table.name === 'classes') {
            const record = memoryDB.classes.get(id.value);
            const updated = { ...record, ...data };
            memoryDB.classes.set(id.value, updated);
            return [updated];
          }
          return [];
        },
      }),
    }),
  }),
  // Simplesmente para não quebrar
  execute: async () => {},
};


describe('Classes Integration (Full Plan Coverage)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let db: any;
  let jwtService: JwtService;
  let adminService: AdminService;

  let studentToken: string;
  let personalToken: string;
  let studentId: string;
  let personalId: string;
  let proposalId: string;
  let classId: string;

  // Mocks
  const mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job' }), process: jest.fn() };
  const mockEmailService = { sendEmail: jest.fn().mockResolvedValue(true) };
  const mockFirebaseService = { sendToUser: jest.fn().mockResolvedValue(true) };
  const mockMPService = { 
    capturePayment: jest.fn().mockResolvedValue({ status: 'approved' }),
    refundPayment: jest.fn().mockResolvedValue({ status: 'refunded' })
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        DatabaseModule,
        AuthModule,
        ClassesModule,
        AdminModule,
      ],
    })
    .overrideProvider('DATABASE_CONNECTION')
    .useValue(mockDbProvider) // << USANDO O MOCK ROBUSTO
    .overrideProvider(getQueueToken('notifications'))
    .useValue(mockQueue)
    .overrideProvider(getQueueToken('gamification-events'))
    .useValue(mockQueue)
    .overrideProvider(EmailService)
    .useValue(mockEmailService)
    .overrideProvider(FirebaseNotificationService)
    .useValue(mockFirebaseService)
    .overrideProvider(MercadoPagoService)
    .useValue(mockMPService)
    .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    
    db = moduleRef.get('DATABASE_CONNECTION');
    jwtService = moduleRef.get(JwtService);
    adminService = moduleRef.get(AdminService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    // Limpar o mock em memória
    memoryDB.users.clear();
    memoryDB.proposals.clear();
    memoryDB.classes.clear();
    memoryDB.payments.clear();
    memoryDB.classPresenceSnapshots.clear();

    const [student] = await db.insert(users).values({ email: 's@t.com', /* ... */ }).returning();
    studentId = student.id;
    studentToken = jwtService.sign({ sub: studentId });

    const [personal] = await db.insert(users).values({ email: 'p@t.com', /* ... */ }).returning();
    personalId = personal.id;
    personalToken = jwtService.sign({ sub: personalId });

    const [proposal] = await db.insert(proposals).values({ studentId, personalId, status: 'accepted' }).returning();
    proposalId = proposal.id;

    const now = new Date();
    const [classEntry] = await db.insert(classes).values({
      proposalId, studentId, personalId, status: 'scheduled',
      date: now,
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    }).returning();
    classId = classEntry.id;
    
    await db.insert(payments).values({ classId, studentId, personalId, status: 'authorized' });
  });

  it('deve validar o fluxo completo: start -> code -> active -> 45min block', async () => {
      const startRes = await request(app.getHttpServer())
        .post(`/classes/${classId}/start`)
        .set('Authorization', `Bearer ${personalToken}`).expect(201);
      
      const code = startRes.body.startConfirmationCode;
      
      await request(app.getHttpServer())
        .post(`/classes/${classId}/confirm-start`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ confirmed: true, confirmationCode: '0000' }).expect(400);

      const confirmRes = await request(app.getHttpServer())
        .post(`/classes/${classId}/confirm-start`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ confirmed: true, confirmationCode: code }).expect(201);
      
      await request(app.getHttpServer())
        .post(`/classes/${classId}/complete`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ notes: 'Fim' }).expect(400);
  });

  // Outros testes...
});
