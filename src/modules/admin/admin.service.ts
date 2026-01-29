import { Injectable, Inject } from '@nestjs/common';
import { users, proposals, classes, payments } from '../../database/schema';
import { count, desc, eq, sql, sum } from 'drizzle-orm';
import { missions } from '../../database/schema/gamification';

@Injectable()
export class AdminService {
  constructor(@Inject('DATABASE_CONNECTION') private readonly db: any) {}

  async getDashboardSummary() {
    const [userCount, proposalStats, classStats, paymentStats] =
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
    };
  }

  async listUsers() {
    const list = await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        userType: users.userType,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(50);
    return list;
  }

  async updateUser(id: string, body: any) {
    const allowed = {
      firstName: body.firstName,
      lastName: body.lastName,
      userType: body.userType, // cuidado: requer políticas adequadas
    } as any;

    const [updated] = await this.db
      .update(users)
      .set({ ...allowed, updatedAt: new Date() })
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
