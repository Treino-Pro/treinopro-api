import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-store';
import { CrefCacheService } from '../modules/cref/cref-cache.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore as any,
        host: configService.get('REDIS_HOST', 'localhost'),
        port: configService.get('REDIS_PORT', 6379),
        password: configService.get('REDIS_PASSWORD'),
        db: configService.get('REDIS_DB', 0),
        ttl: 3600, // 1 hora em segundos
        max: 1000, // máximo de itens no cache
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [CrefCacheService],
  exports: [CrefCacheService],
})
export class SharedCacheModule {}
