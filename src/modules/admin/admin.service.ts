import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { users, proposals, classes, payments, paymentDisputes } from '../../database/schema';
import { count, desc, eq, sql, sum, or, and, like, ilike } from 'drizzle-orm';
import { missions } from '../../database/schema/gamification';

@Injectable()
export class AdminService {
  constructor(@Inject('DATABASE_CONNECTION') private readonly db: any) {}

  async getDashboardSummary() {
    const [userCount, proposalStats, classStats, paymentStats, disputesCount] =
      await Promise.all([
        this.db.select({ total: count() }).from(users),
        this.db
          .select({
            total: count(),
            pending: sql<number>`count(case when ${proposals.status} = 'pending' then 1 end)`,
            matched: sql<number>`count(case when ${proposals.status} = 'matched' then 1 end)`,
            completed: sql<number>`count(case when ${proposals.status} = 'completed' then 1 end)`,
            cancelled: sql<number>`count(case when ${proposals.status} = 'cancelled' then 1 end)`,
          })
          .from(proposals),
        this.db
          .select({
            total: count(),
            scheduled: sql<number>`count(case when ${classes.status} = 'scheduled' then 1 end)`,
            active: sql<number>`count(case when ${classes.status} = 'active' then 1 end)`,
            completed: sql<number>`count(case when ${classes.status} = 'completed' then 1 end)`,
            cancelled: sql<number>`count(case when ${classes.status} = 'cancelled' then 1 end)`,
          })
          .from(classes),
        this.db.query.payments?.findMany
          ? this.db.query.payments.findMany({
              with: {
                student: {
                  columns: { id: true, firstName: true, lastName: true, email: true },
                },
                personal: {
                  columns: { id: true, firstName: true, lastName: true, email: true },
                },
              },
              orderBy: [desc(payments.createdAt)],
              limit: 5,
            })
          : Promise.resolve([]),
        // Contar disputas não resolvidas: payment disputes (pending/under_review) + no-show disputes em classes
        Promise.all([
          // Disputas de pagamento não resolvidas
          this.db
            .select({ count: count() })
            .from(paymentDisputes)
            .where(
              or(
                eq(paymentDisputes.status, 'pending'),
                eq(paymentDisputes.status, 'under_review')
              )
            ),
          // Disputas de no-show em classes (status = 'no_show_dispute')
          this.db
            .select({ count: count() })
            .from(classes)
            .where(eq(classes.status, 'no_show_dispute')),
        ]).then(([paymentDisputesResult, noShowDisputesResult]) => {
          const paymentDisputesCount = paymentDisputesResult[0]?.count ?? 0;
          const noShowDisputesCount = noShowDisputesResult[0]?.count ?? 0;
          return paymentDisputesCount + noShowDisputesCount;
        }),
      ]);

    // Formatar pagamentos com nomes dos usuários
    const formattedPayments = Array.isArray(paymentStats)
      ? paymentStats.map((payment: any) => {
          const studentName =
            payment.student?.firstName && payment.student?.lastName
              ? `${payment.student.firstName} ${payment.student.lastName}`
              : payment.student?.firstName || payment.student?.email || null;
          const personalName =
            payment.personal?.firstName && payment.personal?.lastName
              ? `${payment.personal.firstName} ${payment.personal.lastName}`
              : payment.personal?.firstName || payment.personal?.email || null;

          return {
            id: payment.id,
            totalAmount: payment.totalAmount ? Number(payment.totalAmount) : 0,
            status: payment.status || 'pending',
            createdAt: payment.createdAt ? new Date(payment.createdAt).toISOString() : new Date().toISOString(),
            studentName: studentName || null,
            personalName: personalName || null,
            mpPaymentId: payment.mpPaymentId || null,
          };
        })
      : [];

    return {
      users: userCount[0]?.total ?? 0,
      proposals: proposalStats[0] ?? {},
      classes: classStats[0] ?? {},
      latestPayments: formattedPayments,
      unresolvedDisputes: disputesCount ?? 0,
    };
  }

  async listUsers(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    userType?: string;
    status?: string;
    isVerified?: boolean;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const offset = (page - 1) * limit;

    // Construir condições de filtro
    const conditions = [];

    if (filters?.search) {
      conditions.push(
        or(
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`),
        ),
      );
    }

    if (filters?.userType) {
      conditions.push(eq(users.userType, filters.userType));
    }

    if (filters?.status) {
      conditions.push(eq(users.status, filters.status));
    }

    if (filters?.isVerified !== undefined) {
      conditions.push(eq(users.isVerified, filters.isVerified));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Buscar usuários
    const usersList = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        userType: users.userType,
        status: users.status,
        isVerified: users.isVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Contar total
    const totalResult = await this.db
      .select({ total: count() })
      .from(users)
      .where(whereClause);

    const total = totalResult[0]?.total ?? 0;

    return {
      users: usersList,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(id: string) {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, id),
      with: {
        documentImage: true,
        crefImage: true,
        profileImage: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Processar URLs das imagens
    const baseUrl = process.env.BASE_URL || 'https://api.treinopro.com';
    
    let documentImageUrl = null;
    if (user.documentImage?.url) {
      try {
        const original = new URL(user.documentImage.url);
        const normalizedBase = new URL(baseUrl);
        documentImageUrl = `${normalizedBase.origin}${original.pathname}`;
      } catch (_) {
        documentImageUrl = user.documentImage.url.replace(
          'https://api.treinopro.com',
          baseUrl,
        );
      }
    }

    let crefImageUrl = null;
    if (user.crefImage?.url) {
      try {
        const original = new URL(user.crefImage.url);
        const normalizedBase = new URL(baseUrl);
        crefImageUrl = `${normalizedBase.origin}${original.pathname}`;
      } catch (_) {
        crefImageUrl = user.crefImage.url.replace(
          'https://api.treinopro.com',
          baseUrl,
        );
      }
    }

    let profileImageUrl = null;
    if (user.profileImage?.url) {
      try {
        const original = new URL(user.profileImage.url);
        const normalizedBase = new URL(baseUrl);
        profileImageUrl = `${normalizedBase.origin}${original.pathname}`;
      } catch (_) {
        profileImageUrl = user.profileImage.url.replace(
          'https://api.treinopro.com',
          baseUrl,
        );
      }
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      status: user.status,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      birthDate: user.birthDate,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      documentImageId: user.documentImageId,
      documentImageUrl,
      cref: user.cref,
      crefValidated: user.crefValidated,
      crefImageId: user.crefImageId,
      crefImageUrl,
      specialties: user.specialties,
      rating: user.rating ? parseFloat(user.rating.toString()) : 5.0,
      totalRatings: user.totalRatings || 0,
      isMinor: user.isMinor,
      guardianName: user.guardianName,
      guardianEmail: user.guardianEmail,
      profileImageId: user.profileImageId,
      profileImageUrl,
    };
  }

  async updateUser(id: string, body: any) {
    // Verificar se usuário existe
    const existingUser = await this.db.query.users.findFirst({
      where: eq(users.id, id),
    });

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const allowed: any = {
      updatedAt: new Date(),
    };

    // Permitir atualizar status e isVerified conforme DTO
    if (body.status !== undefined) {
      allowed.status = body.status;
    }
    if (body.isVerified !== undefined) {
      allowed.isVerified = body.isVerified;
    }

    // Campos editáveis básicos
    if (body.firstName !== undefined && body.firstName.trim()) {
      allowed.firstName = body.firstName.trim();
    }
    if (body.lastName !== undefined && body.lastName.trim()) {
      allowed.lastName = body.lastName.trim();
    }

    // Email - verificar se já existe antes de atualizar
    if (body.email !== undefined && body.email.trim()) {
      const emailToUpdate = body.email.trim().toLowerCase();
      if (emailToUpdate !== existingUser.email) {
        // Verificar se email já está em uso por outro usuário
        const emailExists = await this.db.query.users.findFirst({
          where: eq(users.email, emailToUpdate),
        });
        if (emailExists && emailExists.id !== id) {
          throw new ConflictException('Email já está em uso por outro usuário');
        }
        allowed.email = emailToUpdate;
      }
    }

    // Tipo de usuário (cuidado: requer políticas adequadas)
    if (body.userType !== undefined) {
      allowed.userType = body.userType;
    }

    const [updated] = await this.db
      .update(users)
      .set(allowed)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getFinancialSummary() {
    try {
      const [summary] = await this.db
        .select({
          totalPayments: count(),
          totalAmount: sum(payments.totalAmount),
          platformFees: sum(payments.platformFee),
          personalAmounts: sum(payments.personalAmount),
        })
        .from(payments);

      const latest = this.db.query.payments?.findMany
        ? await this.db.query.payments.findMany({
            orderBy: [desc(payments.createdAt)],
            limit: 20,
          })
        : [];

      return { summary, latest };
    } catch (e) {
      return { summary: {}, latest: [] };
    }
  }

  async listMissions() {
    const list = await this.db
      .select({
        id: missions.id,
        title: missions.title,
        description: missions.description,
        xpReward: missions.xpReward,
        type: missions.type,
        isActive: missions.isActive,
        startDate: missions.startDate,
        endDate: missions.endDate,
        createdAt: missions.createdAt,
        updatedAt: missions.updatedAt,
      })
      .from(missions)
      .orderBy(desc(missions.createdAt))
      .limit(100);
    return list;
  }

  async updateMission(id: string, body: any) {
    const allowed = {
      title: body.title,
      description: body.description,
      xpReward: body.xpReward,
      type: body.type,
      isActive: body.isActive,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      requirements: body.requirements,
      updatedAt: new Date(),
    } as any;

    const [updated] = await this.db
      .update(missions)
      .set(allowed)
      .where(eq(missions.id, id))
      .returning();
    return updated;
  }

  async getAnalytics() {
    // Métricas agregadas principais para visão geral rápida
    const [usersAgg] = await this.db.select({ total: count() }).from(users);
    const [proposalsAgg] = await this.db
      .select({
        total: count(),
        pending: sql<number>`count(case when ${proposals.status} = 'pending' then 1 end)`,
        matched: sql<number>`count(case when ${proposals.status} = 'matched' then 1 end)`,
        completed: sql<number>`count(case when ${proposals.status} = 'completed' then 1 end)`,
        cancelled: sql<number>`count(case when ${proposals.status} = 'cancelled' then 1 end)`,
      })
      .from(proposals);

    const [classesAgg] = await this.db
      .select({
        total: count(),
        scheduled: sql<number>`count(case when ${classes.status} = 'scheduled' then 1 end)`,
        active: sql<number>`count(case when ${classes.status} = 'active' then 1 end)`,
        completed: sql<number>`count(case when ${classes.status} = 'completed' then 1 end)`,
        cancelled: sql<number>`count(case when ${classes.status} = 'cancelled' then 1 end)`,
      })
      .from(classes);

    const [paymentsAgg] = await this.db
      .select({
        total: count(),
        totalAmount: sum(payments.totalAmount),
        platformFees: sum(payments.platformFee),
        personalAmounts: sum(payments.personalAmount),
      })
      .from(payments);

    return {
      users: usersAgg?.total ?? 0,
      proposals: proposalsAgg || {},
      classes: classesAgg || {},
      payments: paymentsAgg || {},
    };
  }

  async getChartsData(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Receita por dia (últimos N dias)
    const revenueData = await this.db
      .select({
        date: sql<string>`DATE(${payments.createdAt})::text`,
        revenue: sum(payments.totalAmount),
      })
      .from(payments)
      .where(sql`DATE(${payments.createdAt}) >= ${startDateStr}`)
      .groupBy(sql`DATE(${payments.createdAt})`)
      .orderBy(sql`DATE(${payments.createdAt})`);

    // Atividade de aulas por status por dia
    const classesActivityData = await this.db
      .select({
        date: sql<string>`DATE(${classes.createdAt})::text`,
        status: classes.status,
        count: count(),
      })
      .from(classes)
      .where(sql`DATE(${classes.createdAt}) >= ${startDateStr}`)
      .groupBy(sql`DATE(${classes.createdAt})`, classes.status)
      .orderBy(sql`DATE(${classes.createdAt})`);

    // Cadastros por dia
    const registrationsData = await this.db
      .select({
        date: sql<string>`DATE(${users.createdAt})::text`,
        count: count(),
      })
      .from(users)
      .where(sql`DATE(${users.createdAt}) >= ${startDateStr}`)
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    // Criar mapa de todas as datas no período
    const allDates: string[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      allDates.push(date.toISOString().split('T')[0]);
    }

    // Processar dados de receita (preencher dias sem dados com 0)
    const revenueMap = new Map<string, number>();
    revenueData.forEach((row: any) => {
      revenueMap.set(row.date, Number(row.revenue || 0));
    });
    const revenueChart = allDates.map((date) => ({
      date,
      revenue: revenueMap.get(date) || 0,
    }));

    // Processar dados de atividade de aulas (agrupar por data e status)
    const activityMap = new Map<string, Record<string, number>>();
    classesActivityData.forEach((row: any) => {
      const date = row.date;
      if (!activityMap.has(date)) {
        activityMap.set(date, {
          scheduled: 0,
          pending_confirmation: 0,
          active: 0,
          completed: 0,
          cancelled: 0,
          no_show_dispute: 0,
        });
      }
      const statusMap = activityMap.get(date)!;
      statusMap[row.status as string] = Number(row.count || 0);
    });
    const classesActivityChart = allDates.map((date) => {
      const statuses = activityMap.get(date) || {
        scheduled: 0,
        pending_confirmation: 0,
        active: 0,
        completed: 0,
        cancelled: 0,
        no_show_dispute: 0,
      };
      return { date, ...statuses };
    });

    // Processar dados de cadastros (preencher dias sem dados com 0)
    const registrationsMap = new Map<string, number>();
    registrationsData.forEach((row: any) => {
      registrationsMap.set(row.date, Number(row.count || 0));
    });
    const registrationsChart = allDates.map((date) => ({
      date,
      count: registrationsMap.get(date) || 0,
    }));

    return {
      revenue: revenueChart,
      classesActivity: classesActivityChart,
      registrations: registrationsChart,
    };
  }
}
