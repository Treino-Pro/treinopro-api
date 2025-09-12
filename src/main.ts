import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Configuração global de validação
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Configuração do CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('TreinoPRO API')
    .setDescription('API para o aplicativo TreinoPRO - Conexão entre Alunos e Personal Trainers')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get('PORT') || 3000;
  
  await app.listen(port);
  console.log(`🚀 TreinoPRO API rodando na porta ${port}`);
  console.log(`📚 Documentação disponível em http://localhost:${port}/api/docs`);
}
bootstrap();
