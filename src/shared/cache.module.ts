import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-store';
import { CrefCacheService } from '../modules/cref/cref-cache.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({
          socket: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: Number(configService.get('REDIS_PORT', 6379)),
          },
          password: configService.get('REDIS_PASSWORD'),
        });

        return {
          store: store as unknown as any, // 👈 forçamos o tipo esperado
          ttl: 3600,
        };
      },
    }),
  ],
  providers: [CrefCacheService],
  exports: [CacheModule, CrefCacheService], // ✅ Exportar CacheModule para disponibilizar CACHE_MANAGER
})
export class SharedCacheModule {}
