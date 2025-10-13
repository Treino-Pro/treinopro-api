import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { db } from './connection';
import { mockDb } from './mock-db';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useValue: db || mockDb,
    },
  ],
  exports: ['DATABASE_CONNECTION'],
})
export class DatabaseModule {}
