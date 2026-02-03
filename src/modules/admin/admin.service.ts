import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { users, proposals, classes, payments, paymentDisputes, files } from '../../database/schema';
import { count, desc, eq, sql, sum, or, and, like, ilike, gte, lte, inArray } from 'drizzle-orm';
import { missions } from '../../database/schema/gamification';
import * as path from 'path';
import * as fs from 'fs/promises';

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
        this.db
          .select({
            id: payments.id,
            totalAmount: payments.totalAmount,
            platformFee: payments.platformFee,
            personalAmount: payments.personalAmount,
            status: payments.status,
            createdAt: payments.createdAt,
            mpPaymentId: payments.mpPaymentId,
            studentFirstName: users.firstName,
            studentLastName: users.lastName,
            studentEmail: users.email,
          })
          .from(payments)
          .leftJoin(users, eq(payments.studentId, users.id))
          .orderBy(desc(payments.createdAt))
          .limit(5)
          .then(async (rows: any[]) => {
            if (rows.length === 0) return [];
            const paymentIds = rows.map((r) => r.id);
            const personalsRaw = await this.db
              .select({
                paymentId: payments.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
              })
              .from(payments)
              .innerJoin(users, eq(payments.personalId, users.id))
              .where(inArray(payments.id, paymentIds));
            const personalsMap = new Map<string, { firstName: string; lastName: string; email: string }>();
            personalsRaw.forEach((r: any) => {
              personalsMap.set(r.paymentId, {
                firstName: r.firstName ?? '',
                lastName: r.lastName ?? '',
                email: r.email ?? '',
              });
            });
            return rows.map((row: any) => {
              const studentName =
                row.studentFirstName != null && row.studentLastName != null
                  ? `${row.studentFirstName} ${row.studentLastName}`.trim()
                  : row.studentFirstName || row.studentLastName || row.studentEmail || null;
              const personalData = personalsMap.get(row.id);
              const personalName =
                personalData?.firstName != null && personalData?.lastName != null
                  ? `${personalData.firstName} ${personalData.lastName}`.trim()
                  : personalData?.firstName || personalData?.lastName || personalData?.email || null;
              return {
                id: row.id,
                totalAmount: row.totalAmount ? Number(row.totalAmount) : 0,
                status: row.status || 'pending',
                createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
                studentName: studentName || null,
                personalName: personalName || null,
                mpPaymentId: row.mpPaymentId || null,
              };
            });
          }),
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

    // paymentStats já vem formatado com studentName/personalName (select+join)
    const formattedPayments = Array.isArray(paymentStats) ? paymentStats : [];

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
    
    const normalizeUrl = (url: string | null | undefined, category?: string): string | null => {
      if (!url) return null;
      
      // Se a URL já é completa e válida
      if (url.startsWith('http://') || url.startsWith('https://')) {
        try {
          const urlObj = new URL(url);
          const normalizedBase = new URL(baseUrl);
          
          // Se o hostname é diferente, normalizar mantendo o pathname completo
          if (urlObj.hostname !== normalizedBase.hostname || urlObj.port !== normalizedBase.port) {
            const normalized = `${normalizedBase.origin}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
            console.log(`🔄 [ADMIN] URL normalizada: ${url} -> ${normalized}`);
            return normalized;
          }
          
          // Se já está correto, retornar como está
          console.log(`✅ [ADMIN] URL já está correta: ${url}`);
          return url;
        } catch (e) {
          console.warn(`⚠️ [ADMIN] Erro ao fazer parse da URL: ${url}`, e);
          // Tentar substituir o hostname e porta
          const urlPattern = /https?:\/\/[^/]+/;
          return url.replace(urlPattern, baseUrl);
        }
      }
      
      // Se é um caminho relativo que já começa com /static/, adicionar baseUrl
      if (url.startsWith('/static/')) {
        const normalized = `${baseUrl}${url}`;
        console.log(`🔗 [ADMIN] URL relativa normalizada: ${url} -> ${normalized}`);
        return normalized;
      }
      
      // Se é um caminho relativo sem /static/, adicionar
      if (url.startsWith('/')) {
        // Se não tem /static/ no caminho, adicionar baseado na categoria
        if (!url.includes('/static/')) {
          let categoryPath = 'images/documents'; // padrão
          if (category === 'profile' || url.includes('profile')) {
            categoryPath = 'images/profiles';
          } else if (url.includes('documents') || url.includes('document')) {
            categoryPath = 'images/documents';
          }
          const normalized = `${baseUrl}/static/${categoryPath}${url}`;
          console.log(`🔗 [ADMIN] URL relativa sem /static/ normalizada: ${url} -> ${normalized}`);
          return normalized;
        }
        return `${baseUrl}${url}`;
      }
      
      // Se não começa com /, assumir que é apenas o nome do arquivo
      // Usar categoria para determinar o caminho
      const categoryPath = category === 'profile' ? 'images/profiles' : 'images/documents';
      const normalized = `${baseUrl}/static/${categoryPath}/${url}`;
      console.log(`🔗 [ADMIN] Nome de arquivo normalizado: ${url} -> ${normalized}`);
      return normalized;
    };
    
    const documentImageUrl = normalizeUrl(user.documentImage?.url, 'document');
    const crefImageUrl = normalizeUrl(user.crefImage?.url, 'document');
    const profileImageUrl = normalizeUrl(user.profileImage?.url, 'profile');

    // Log para debug
    if (documentImageUrl) {
      console.log(`📄 [ADMIN] DocumentImageUrl para usuário ${id}:`, documentImageUrl);
    }
    if (crefImageUrl) {
      console.log(`📄 [ADMIN] CrefImageUrl para usuário ${id}:`, crefImageUrl);
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

  /**
   * Retorna o caminho absoluto e o mimeType de um arquivo para streaming.
   * Usado pelo endpoint GET /admin/files/:id para servir imagens/documentos com autenticação.
   */
  async getFileForStream(fileId: string): Promise<{ absolutePath: string; mimeType: string }> {
    const fileRecord = await this.db.query.files.findFirst({
      where: eq(files.id, fileId),
    });

    if (!fileRecord) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    const storedPath = fileRecord.path as string;
    const storageBase =
      process.env.STORAGE_PATH && path.isAbsolute(process.env.STORAGE_PATH)
        ? process.env.STORAGE_PATH
        : path.join(process.cwd(), process.env.STORAGE_PATH || 'storage');
    const relativePath = storedPath.replace(/^(\.\/)?storage\/?/, '');
    const absolutePath = path.isAbsolute(storedPath)
      ? storedPath
      : path.join(storageBase, relativePath);

    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo não encontrado no servidor');
    }

    return {
      absolutePath,
      mimeType: fileRecord.mimeType as string,
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

  async getFinancialSummary(filters?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const page = Math.max(1, filters?.page ?? 1);
      const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
      const offset = (page - 1) * limit;

      const hasDateFilter =
        filters?.startDate && filters?.endDate && filters.startDate <= filters.endDate;
      const startDateStr = hasDateFilter ? filters.startDate! : null;
      const endDateStr = hasDateFilter ? filters.endDate! : null;

      const startOfStart = startDateStr
        ? new Date(startDateStr + 'T00:00:00.000Z')
        : null;
      const endOfEnd = endDateStr
        ? new Date(endDateStr + 'T23:59:59.999Z')
        : null;

      const baseWhere =
        hasDateFilter && startOfStart && endOfEnd
          ? and(gte(payments.createdAt, startOfStart), lte(payments.createdAt, endOfEnd))
          : undefined;

      const [summary] = await this.db
        .select({
          totalPayments: count(),
          totalAmount: sum(payments.totalAmount),
          platformFees: sum(payments.platformFee),
          personalAmounts: sum(payments.personalAmount),
        })
        .from(payments)
        .where(baseWhere ?? undefined);

      const totalCount = Number(summary?.totalPayments ?? 0);

      // Buscar pagamentos com nomes de aluno e personal via join (garante studentName/personalName)
      const latestRaw = await this.db
        .select({
          id: payments.id,
          totalAmount: payments.totalAmount,
          platformFee: payments.platformFee,
          personalAmount: payments.personalAmount,
          status: payments.status,
          createdAt: payments.createdAt,
          mpPaymentId: payments.mpPaymentId,
          studentFirstName: users.firstName,
          studentLastName: users.lastName,
          studentEmail: users.email,
        })
        .from(payments)
        .leftJoin(users, eq(payments.studentId, users.id))
        .where(baseWhere ?? sql`1=1`)
        .orderBy(desc(payments.createdAt))
        .limit(limit)
        .offset(offset);

      // Segunda query para personal (não dá para fazer dois joins na mesma tabela sem alias)
      const paymentIds = latestRaw.map((r: any) => r.id);
      const personalsMap = new Map<string, { firstName: string; lastName: string; email: string }>();
      if (paymentIds.length > 0) {
        const personalsRaw = await this.db
          .select({
            paymentId: payments.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          })
          .from(payments)
          .innerJoin(users, eq(payments.personalId, users.id))
          .where(inArray(payments.id, paymentIds));
        personalsRaw.forEach((r: any) => {
          personalsMap.set(r.paymentId, {
            firstName: r.firstName ?? '',
            lastName: r.lastName ?? '',
            email: r.email ?? '',
          });
        });
      }

      const latest = latestRaw.map((row: any) => {
        const studentName =
          row.studentFirstName != null && row.studentLastName != null
            ? `${row.studentFirstName} ${row.studentLastName}`.trim()
            : row.studentFirstName || row.studentLastName || row.studentEmail || null;
        const personalData = personalsMap.get(row.id);
        const personalName =
          personalData?.firstName != null && personalData?.lastName != null
            ? `${personalData.firstName} ${personalData.lastName}`.trim()
            : personalData?.firstName || personalData?.lastName || personalData?.email || null;
        return {
          id: row.id,
          totalAmount: row.totalAmount ? Number(row.totalAmount) : 0,
          platformFee: row.platformFee ? Number(row.platformFee) : 0,
          personalAmount: row.personalAmount ? Number(row.personalAmount) : 0,
          status: row.status || 'pending',
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          studentName: studentName || null,
          personalName: personalName || null,
          mpPaymentId: row.mpPaymentId || null,
        };
      });

      return {
        summary,
        latest,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
        startDate: startDateStr ?? undefined,
        endDate: endDateStr ?? undefined,
      };
    } catch (e) {
      return {
        summary: {
          totalPayments: 0,
          totalAmount: 0,
          platformFees: 0,
          personalAmounts: 0,
        },
        latest: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        startDate: undefined,
        endDate: undefined,
      };
    }
  }

  async listClassDisputes(filters?: { page?: number; limit?: number }) {
    const pageNum = Math.max(1, filters?.page ?? 1);
    const limitNum = Math.min(100, Math.max(1, filters?.limit ?? 20));
    const offset = (pageNum - 1) * limitNum;

    const [itemsRaw, countResult] = await Promise.all([
      this.db.query.classes.findMany({
        where: eq(classes.status, 'no_show_dispute'),
        with: {
          student: true,
          personal: true,
        },
        orderBy: [desc(classes.createdAt)],
        limit: limitNum,
        offset,
      }),
      this.db
        .select({ count: count() })
        .from(classes)
        .where(eq(classes.status, 'no_show_dispute')),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limitNum) || 1;
    const items = itemsRaw.map((c: any) => ({
      id: c.id,
      classId: c.id,
      date: c.date,
      time: c.time,
      location: c.location,
      status: c.status,
      disputeStatus: c.disputeStatus,
      noShowReportedBy: c.noShowReportedBy,
      noShowReportedAt: c.noShowReportedAt,
      noShowReason: c.noShowReason,
      noShowNotes: c.noShowNotes,
      evidenceDeadline: c.evidenceDeadline,
      studentEvidence: c.studentEvidence,
      personalEvidence: c.personalEvidence,
      studentName:
        c.student?.firstName != null && c.student?.lastName != null
          ? `${c.student.firstName} ${c.student.lastName}`.trim()
          : c.student?.email ?? null,
      personalName:
        c.personal?.firstName != null && c.personal?.lastName != null
          ? `${c.personal.firstName} ${c.personal.lastName}`.trim()
          : c.personal?.email ?? null,
      createdAt: c.createdAt,
    }));
    return { items, total, totalPages };
  }

  async resolveClassDispute(
    classId: string,
    body: { resolution: 'resolved_for_student' | 'resolved_for_personal'; adminNotes?: string },
  ) {
    const [classRow] = await this.db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!classRow) {
      throw new NotFoundException('Aula não encontrada');
    }

    if (classRow.status !== 'no_show_dispute') {
      throw new BadRequestException('A aula não está em disputa');
    }

    const resolution = body.resolution;
    const newDisputeStatus = resolution;
    const newClassStatus =
      resolution === 'resolved_for_personal' ? 'completed' : 'custody';

    await this.db
      .update(classes)
      .set({
        disputeStatus: newDisputeStatus,
        status: newClassStatus,
        resolution: body.adminNotes ?? null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(classes.id, classId));

    return {
      id: classId,
      disputeStatus: newDisputeStatus,
      status: newClassStatus,
      resolvedAt: new Date().toISOString(),
    };
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
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined,
      endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : undefined,
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

  /** Normaliza valor de data para string YYYY-MM-DD (driver pode retornar Date ou string) */
  private normalizeDateKey(val: unknown): string {
    if (val == null) return '';
    if (typeof val === 'string') {
      const match = val.match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : val;
    }
    if (val instanceof Date) return val.toISOString().split('T')[0];
    return String(val);
  }

  async getChartsData(days: number = 30) {
    // MAX (days <= 0) = buscar todo o histórico de transações, sem limite de data
    const isMax = days <= 0;
    const startDate = new Date();
    if (!isMax) {
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setFullYear(1970, 0, 1);
      startDate.setHours(0, 0, 0, 0);
    }
    const startDateStr = startDate.toISOString().split('T')[0];

    // Receita por dia: últimos N dias OU todo o histórico (MAX = sem filtro de data final)
    const revenueWhere = sql`DATE(${payments.createdAt}) >= ${startDateStr}`;
    const revenueData = await this.db
      .select({
        date: sql<string>`DATE(${payments.createdAt})::text`,
        revenue: sum(payments.totalAmount),
      })
      .from(payments)
      .where(revenueWhere)
      .groupBy(sql`DATE(${payments.createdAt})`)
      .orderBy(sql`DATE(${payments.createdAt})`);

    const classesWhere = sql`DATE(${classes.createdAt}) >= ${startDateStr}`;
    const classesActivityData = await this.db
      .select({
        date: sql<string>`DATE(${classes.createdAt})::text`,
        status: classes.status,
        count: count(),
      })
      .from(classes)
      .where(classesWhere)
      .groupBy(sql`DATE(${classes.createdAt})`, classes.status)
      .orderBy(sql`DATE(${classes.createdAt})`);

    const usersWhere = sql`DATE(${users.createdAt}) >= ${startDateStr}`;
    const registrationsData = await this.db
      .select({
        date: sql<string>`DATE(${users.createdAt})::text`,
        count: count(),
      })
      .from(users)
      .where(usersWhere)
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    // Criar mapa de todas as datas no período
    let allDates: string[];
    if (isMax) {
      const dateSet = new Set<string>();
      revenueData.forEach((row: any) => {
        const d = this.normalizeDateKey(row.date);
        if (d) dateSet.add(d);
      });
      classesActivityData.forEach((row: any) => {
        const d = this.normalizeDateKey(row.date);
        if (d) dateSet.add(d);
      });
      registrationsData.forEach((row: any) => {
        const d = this.normalizeDateKey(row.date);
        if (d) dateSet.add(d);
      });
      const sorted = Array.from(dateSet).sort();
      if (sorted.length === 0) {
        allDates = [];
      } else {
        const first = new Date(sorted[0] + 'T00:00:00.000Z');
        const last = new Date(sorted[sorted.length - 1] + 'T00:00:00.000Z');
        allDates = [];
        const current = new Date(first);
        while (current <= last) {
          allDates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      }
    } else {
      allDates = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        allDates.push(date.toISOString().split('T')[0]);
      }
    }

    // Processar dados de receita (preencher dias sem dados com 0)
    const revenueMap = new Map<string, number>();
    revenueData.forEach((row: any) => {
      const d = this.normalizeDateKey(row.date);
      if (d) revenueMap.set(d, Number(row.revenue || 0));
    });
    const revenueChart = allDates.map((date) => ({
      date,
      revenue: revenueMap.get(date) || 0,
    }));

    // Processar dados de atividade de aulas (agrupar por data e status)
    const activityMap = new Map<string, Record<string, number>>();
    classesActivityData.forEach((row: any) => {
      const date = this.normalizeDateKey(row.date);
      if (!date) return;
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
      const d = this.normalizeDateKey(row.date);
      if (d) registrationsMap.set(d, Number(row.count || 0));
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
