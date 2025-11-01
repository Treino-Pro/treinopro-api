import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CrefValidationResult } from './interfaces/cref.interface';

@Injectable()
export class CrefCacheService {
  private readonly logger = new Logger(CrefCacheService.name);
  private readonly CACHE_PREFIX = 'cref:';
  private readonly CACHE_TTL = 3600; // 1 hora em segundos

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Gera a chave do cache para um CREF
   */
  private getCacheKey(crefNumber: string): string {
    return `${this.CACHE_PREFIX}${crefNumber.toUpperCase()}`;
  }

  /**
   * Busca uma validação no cache
   */
  async get(crefNumber: string): Promise<CrefValidationResult | null> {
    try {
      const cacheKey = this.getCacheKey(crefNumber);
      const cached =
        await this.cacheManager.get<CrefValidationResult>(cacheKey);

      if (cached) {
        this.logger.log(`🎯 [CACHE] Hit para CREF: ${crefNumber}`);
        return cached;
      }

      this.logger.log(`❌ [CACHE] Miss para CREF: ${crefNumber}`);
      return null;
    } catch (error) {
      this.logger.error(
        `💥 [CACHE] Erro ao buscar CREF ${crefNumber}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Armazena uma validação no cache
   */
  async set(
    crefNumber: string,
    validation: CrefValidationResult,
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(crefNumber);
      await this.cacheManager.set(cacheKey, validation, this.CACHE_TTL * 1000);
      this.logger.log(
        `💾 [CACHE] Armazenado CREF: ${crefNumber} (TTL: ${this.CACHE_TTL}s)`,
      );
    } catch (error) {
      this.logger.error(
        `💥 [CACHE] Erro ao armazenar CREF ${crefNumber}:`,
        error.message,
      );
    }
  }

  /**
   * Remove uma validação do cache
   */
  async delete(crefNumber: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(crefNumber);
      await this.cacheManager.del(cacheKey);
      this.logger.log(`🗑️ [CACHE] Removido CREF: ${crefNumber}`);
    } catch (error) {
      this.logger.error(
        `💥 [CACHE] Erro ao remover CREF ${crefNumber}:`,
        error.message,
      );
    }
  }

  /**
   * Limpa todo o cache de CREF
   */
  async clear(): Promise<void> {
    try {
      // Nota: cache-manager não tem método para limpar por padrão
      // Em produção, seria melhor usar Redis diretamente para isso
      this.logger.log(`🧹 [CACHE] Limpeza de cache solicitada`);
    } catch (error) {
      this.logger.error(`💥 [CACHE] Erro ao limpar cache:`, error.message);
    }
  }

  /**
   * Verifica se o cache está funcionando
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'cref:health-check';
      const testValue = { test: true, timestamp: new Date() };

      await this.cacheManager.set(testKey, testValue, 1000);
      const retrieved = await this.cacheManager.get(testKey);
      await this.cacheManager.del(testKey);

      return (retrieved as any)?.test === true;
    } catch (error) {
      this.logger.error(`💥 [CACHE] Health check falhou:`, error.message);
      return false;
    }
  }

  /**
   * Obtém estatísticas do cache
   */
  async getStats(): Promise<{ hits: number; misses: number; keys: number }> {
    try {
      // Em uma implementação real, você usaria Redis INFO para obter essas estatísticas
      return {
        hits: 0,
        misses: 0,
        keys: 0,
      };
    } catch (error) {
      this.logger.error(
        `💥 [CACHE] Erro ao obter estatísticas:`,
        error.message,
      );
      return { hits: 0, misses: 0, keys: 0 };
    }
  }
}
