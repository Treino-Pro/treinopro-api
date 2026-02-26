// Mock cache-manager-redis-store para evitar conexão Redis real nos testes
jest.mock('cache-manager-redis-store', () => ({
  redisStore: jest.fn().mockResolvedValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() }),
}));

// Habilitar feature flags para os testes
process.env.FEATURE_CODE_4_DIGITS = 'true';
process.env.FEATURE_45_MIN_RULE = 'true';
process.env.FEATURE_DISPUTE_DEFENSE = 'true';
process.env.FEATURE_SETTLEMENT_ON_RESOLVE = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { ClassesModule } from '../../src/modules/classes/classes.module';
import { DatabaseModule } from '../../src/database/database.module';
import { users, proposals, classes, classPresenceSnapshots, payments } from '../../src/database/schema';
import { eq, and, getTableName } from 'drizzle-orm';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { BullModule, getQueueToken } from '@nestjs/bull';
import { EmailService } from '../../src/modules/notifications/services/email.service';
import { FirebaseNotificationService } from '../../src/modules/notifications/services/firebase-notification.service';
import { MercadoPagoService } from '../../src/modules/payments/mercadopago.service';
import { AdminModule } from '../../src/modules/admin/admin.module';
import { AdminService } from '../../src/modules/admin/admin.service';
import { GamificationService } from '../../src/modules/gamification/gamification.service';

// Mock robusto em memória
const memoryDB = {
  users: new Map<string, any>(),
  proposals: new Map<string, any>(),
  classes: new Map<string, any>(),
  payments: new Map<string, any>(),
  classPresenceSnapshots: new Map<string, any>(),
};

const mockDbProvider = {
  query: {
    users: {
      findFirst: async () => { for (const u of memoryDB.users.values()) return u; return null; },
    },
    classes: {
      findFirst: async () => { for (const c of memoryDB.classes.values()) return c; return null; },
    },
    payments: {
      findFirst: async () => { for (const p of memoryDB.payments.values()) return p; return null; },
    },
    classPresenceSnapshots: {
      findFirst: async () => null,
    },
    ratings: {
      findFirst: async () => null,
    },
  },
  insert: (table: any) => ({
    values: (data: any) => ({
      returning: async () => {
        const id = crypto.randomUUID();
        const record = { id, ...data };
        const tname = getTableName(table);
        if (tname === 'users') memoryDB.users.set(id, record);
        if (tname === 'proposals') memoryDB.proposals.set(id, record);
        if (tname === 'classes') memoryDB.classes.set(id, record);
        if (tname === 'payments') memoryDB.payments.set(id, record);
        if (tname === 'class_presence_snapshots') memoryDB.classPresenceSnapshots.set(id, record);
        return [record];
      },
    }),
  }),
  update: (table: any) => ({
    set: (data: any) => ({
      where: (_condition: any) => ({
        returning: async () => {
          const sqlName = getTableName(table);
          const nameMap: Record<string, keyof typeof memoryDB> = {
            users: 'users', proposals: 'proposals', classes: 'classes',
            payments: 'payments', class_presence_snapshots: 'classPresenceSnapshots',
          };
          const key = nameMap[sqlName];
          const map = key ? memoryDB[key] as Map<string, any> : undefined;
          if (!map) return [];
          const [mapKey, record] = [...map.entries()][0] ?? [];
          if (!mapKey) return [];
          const updated = { ...record, ...data };
          map.set(mapKey, updated);
          return [updated];
        },
      }),
    }),
  }),
  select: (_fields?: any) => {
    const chain: any = {
      _tableName: 'classes',
      from(table: any) { chain._tableName = getTableName(table) || 'classes'; return chain; },
      where: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      orderBy: () => chain,
      limit: (n: number) => {
        const nameMap: Record<string, string> = {
          classes: 'classes',
          users: 'users',
          proposals: 'proposals',
          payments: 'payments',
          class_presence_snapshots: 'classPresenceSnapshots',
        };
        const key = nameMap[chain._tableName] || chain._tableName;
        const items = [...((memoryDB as any)[key] || new Map()).values()];
        return Promise.resolve(items.slice(0, n));
      },
    };
    return chain;
  },
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
  let adminToken: string;
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
  const mockGamificationService = {
    processClassCompletion: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        // BullModule com lazyConnect=true para evitar conexão Redis real nos testes
        BullModule.forRoot({
          redis: { host: 'localhost', port: 6379, lazyConnect: true },
        }),
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
    .overrideProvider(GamificationService)
    .useValue(mockGamificationService)
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

    // Resetar mocks
    mockMPService.capturePayment.mockClear();
    mockMPService.refundPayment.mockClear();
    mockFirebaseService.sendToUser.mockClear();

    const [student] = await db.insert(users).values({ email: 's@t.com', /* ... */ }).returning();
    studentId = student.id;
    studentToken = jwtService.sign({ sub: studentId });

    const [personal] = await db.insert(users).values({ email: 'p@t.com', /* ... */ }).returning();
    personalId = personal.id;
    personalToken = jwtService.sign({ sub: personalId });

    // Admin token: JWT com userType: 'admin' (conforme RolesGuard)
    adminToken = jwtService.sign({ sub: 'admin-user-id', userType: 'admin' });

    const [proposal] = await db.insert(proposals).values({ studentId, personalId, status: 'accepted' }).returning();
    proposalId = proposal.id;

    const now = new Date();
    const [classEntry] = await db.insert(classes).values({
      proposalId, studentId, personalId, status: 'scheduled',
      date: now,
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    }).returning();
    classId = classEntry.id;

    await db.insert(payments).values({
      classId,
      studentId,
      personalId,
      status: 'authorized',
      mpPaymentId: 'mock-mp-payment-id-for-test', // Garante que a lógica de settlement seja chamada
    }).returning();
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

  it('deve resolver disputa a favor do personal quando aluno falta', async () => {
    // Colocar aula em disputa diretamente no memoryDB
    const [classKey, classEntry] = [...memoryDB.classes.entries()][0];
    memoryDB.classes.set(classKey, {
      ...classEntry,
      status: 'no_show_dispute',
      noShowReportedBy: 'student',
    });

    const result = await request(app.getHttpServer())
      .post(`/admin/disputes/classes/${classId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'resolved_for_personal', adminNotes: 'Aluno confirmado ausente' })
      .expect(201);

    expect(result.body.status).toBe('completed');
    expect(result.body.disputeStatus).toBe('resolved_for_personal');
    expect(mockMPService.capturePayment).toHaveBeenCalled();
  });

  it('deve resolver disputa a favor do aluno e notificar personal quando personal falta', async () => {
    const [classKey, classEntry] = [...memoryDB.classes.entries()][0];
    memoryDB.classes.set(classKey, {
      ...classEntry,
      status: 'no_show_dispute',
      noShowReportedBy: 'personal',
    });

    const result = await request(app.getHttpServer())
      .post(`/admin/disputes/classes/${classId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'resolved_for_student', adminNotes: 'Personal confirmado ausente' })
      .expect(201);

    expect(result.body.status).toBe('cancelled');
    expect(result.body.disputeStatus).toBe('resolved_for_student');
    expect(mockMPService.refundPayment).toHaveBeenCalled();
    expect(mockFirebaseService.sendToUser).toHaveBeenCalledWith(
      personalId,
      expect.objectContaining({ title: expect.any(String) }),
    );
  });
});
