import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  // Configuração de arquivos estáticos
  const storagePath = process.env.STORAGE_PATH || './storage';
  app.useStaticAssets(join(process.cwd(), storagePath), {
    prefix: '/static/',
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

  await app.listen(port);
  console.log(`🚀 TreinoPRO API rodando na porta ${port}`);
  console.log(
    `📚 Documentação disponível em http://localhost:${port}/api/docs`,
  );
}
bootstrap();
