import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SharedCacheModule } from '../../shared/cache.module';

@Module({
  imports: [
    DatabaseModule,
    SharedCacheModule, // ✅ Adicionado para acesso ao CACHE_MANAGER
    AuthModule, // Importar AuthModule para ter acesso ao JwtService
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Exportar para uso em outros módulos
})
export class UsersModule {}
