import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join, isAbsolute } from 'path';
import * as express from 'express';
import { runMigrations } from './database/run-migrations';
import { seedAdmin } from './database/seed-admin';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Aumentar limite do body parser para suportar uploads grandes (base64, etc.)
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '1gb' }));
  app.use(express.urlencoded({ limit: '1gb', extended: true }));

  // Configuração global de validação
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuração do CORS
  app.enableCors({
    origin: (origin, callback) => {
      // Permitir requisições sem origin (apps móveis)
      if (!origin) return callback(null, true);

      // Permitir origins configurados (web)
      const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
        'http://localhost:3001',
        'http://localhost:5173',
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Permitir qualquer origin em desenvolvimento
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // Bloquear origin não autorizado apenas em produção
      callback(new Error('Não permitido pelo CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
  });

  // Configuração de arquivos estáticos (use STORAGE_PATH absoluto em produção)
  const storagePath =
    process.env.STORAGE_PATH || join(process.cwd(), 'storage');
  const staticDir = isAbsolute(storagePath)
    ? storagePath
    : join(process.cwd(), storagePath);
  app.useStaticAssets(staticDir, {
    prefix: '/static/',
  });

  // Painel admin em HTML estático servido pelo próprio backend
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/panel',
  });

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('TreinoPRO API')
    .setDescription(
      'API para o aplicativo TreinoPRO - Conexão entre Alunos e Personal Trainers',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 3001;

  // Seed de admin antes de ouvir na porta (migrações agora rodam via package.json)
  await seedAdmin();

  await app.listen(port);
  console.log(`🚀 TreinoPRO API rodando na porta ${port}`);
  console.log(
    `📚 Documentação disponível em http://localhost:${port}/api/docs`,
  );
}
bootstrap();
