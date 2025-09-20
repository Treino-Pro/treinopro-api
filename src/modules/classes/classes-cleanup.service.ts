import { Injectable, Logger } from '@nestjs/common';
import { db } from '../../database/connection';
import { classes } from '../../database/schema/classes';
import { eq, and, lt, or, sql } from 'drizzle-orm';

@Injectable()
export class ClassesCleanupService {
  private readonly logger = new Logger(ClassesCleanupService.name);

  /**
   * Limpa aulas expiradas manualmente
   */
  async cleanupExpiredClasses() {
    this.logger.log('🧹 Iniciando limpeza de aulas expiradas...');

    if (!db) {
      this.logger.warn('⚠️ Banco de dados não disponível, pulando limpeza');
      return;
    }

    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      
      // Buscar aulas que deveriam ter terminado mas ainda estão ativas
      const expiredClasses = await db
        .select()
        .from(classes)
        .where(
          and(
            eq(classes.status, 'active'),
            or(
              lt(classes.date, sql`CURRENT_DATE`), // Data passou
              and(
                eq(classes.date, sql`CURRENT_DATE`),
                lt(classes.time, currentTime) // Horário passou hoje
              )
            )
          )
        );

      if (expiredClasses.length === 0) {
        this.logger.log('✅ Nenhuma aula expirada encontrada');
        return;
      }

      this.logger.log(`🔍 Encontradas ${expiredClasses.length} aulas expiradas`);

      // Marcar como no-show
      for (const classEntity of expiredClasses) {
        const classDate = new Date(classEntity.date);
        const [hour, minute] = String(classEntity.time || '00:00').split(':').map(v => parseInt(v, 10));
        const classStart = new Date(classDate.getFullYear(), classDate.getMonth(), classDate.getDate(), hour, minute, 0, 0);
        const classEnd = new Date(classStart.getTime() + (classEntity.duration || 60) * 60 * 1000);

        // Verificar se realmente expirou (com margem de 15 minutos)
        const expiredTime = new Date(classEnd.getTime() + 15 * 60 * 1000); // +15 min de tolerância
        
        if (now > expiredTime) {
          await db
            .update(classes)
            .set({
              status: 'no_show',
              noShowReportedAt: now,
              noShowReportedBy: 'system',
              updatedAt: now,
            })
            .where(eq(classes.id, classEntity.id));

          this.logger.log(`❌ Aula ${classEntity.id} marcada como no-show (deveria ter terminado às ${classEnd.toISOString()})`);
        }
      }

      this.logger.log(`✅ Limpeza concluída: ${expiredClasses.length} aulas processadas`);
    } catch (error) {
      this.logger.error('❌ Erro durante limpeza de aulas expiradas:', error);
    }
  }

  /**
   * Limpeza manual para casos específicos
   */
  async cleanupSpecificClass(classId: string) {
    this.logger.log(`🧹 Limpeza manual da aula ${classId}`);

    if (!db) {
      this.logger.warn('⚠️ Banco de dados não disponível');
      return;
    }

    try {
      const classEntity = await db
        .select()
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      if (classEntity.length === 0) {
        this.logger.warn(`⚠️ Aula ${classId} não encontrada`);
        return;
      }

      const classData = classEntity[0];

      if (classData.status !== 'active' && classData.status !== 'scheduled') {
        this.logger.warn(`⚠️ Aula ${classId} não pode ser limpa (status: ${classData.status})`);
        return;
      }

      const now = new Date();
      const classDate = new Date(classData.date);
      const [hour, minute] = String(classData.time || '00:00').split(':').map(v => parseInt(v, 10));
      const classStart = new Date(classDate.getFullYear(), classDate.getMonth(), classDate.getDate(), hour, minute, 0, 0);
      const classEnd = new Date(classStart.getTime() + (classData.duration || 60) * 60 * 1000);

      this.logger.log(`🔍 [CLEANUP] Verificando aula ${classId}:`);
      this.logger.log(`   - Data da aula: ${classData.date}`);
      this.logger.log(`   - Horário da aula: ${classData.time}`);
      this.logger.log(`   - Duração: ${classData.duration}min`);
      this.logger.log(`   - Início calculado: ${classStart.toISOString()}`);
      this.logger.log(`   - Fim calculado: ${classEnd.toISOString()}`);
      this.logger.log(`   - Hora atual: ${now.toISOString()}`);
      this.logger.log(`   - Aula expirou? ${now > classEnd}`);

      if (now > classEnd) {
        await db
          .update(classes)
          .set({
            status: 'no_show',
            noShowReportedAt: now,
            noShowReportedBy: 'manual',
            updatedAt: now,
          })
          .where(eq(classes.id, classId));

        this.logger.log(`✅ Aula ${classId} marcada como no-show manualmente`);
      } else {
        this.logger.warn(`⚠️ Aula ${classId} ainda não expirou (termina às ${classEnd.toISOString()})`);
      }
    } catch (error) {
      this.logger.error(`❌ Erro durante limpeza manual da aula ${classId}:`, error);
    }
  }
}
