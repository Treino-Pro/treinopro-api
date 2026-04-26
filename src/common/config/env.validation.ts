import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

export class EnvironmentVariables {
  // Database
  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  DATABASE_PORT: number;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  @IsString()
  DATABASE_URL: string;

  // JWT
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN: string;

  // Email
  @IsString()
  @IsOptional()
  EMAIL_HOST?: string;

  @IsNumber()
  @IsOptional()
  EMAIL_PORT?: number;

  @IsString()
  @IsOptional()
  EMAIL_USER?: string;

  @IsString()
  @IsOptional()
  EMAIL_PASS?: string;

  // App
  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsEnum(['development', 'production', 'test'])
  NODE_ENV: string;

  // CORS
  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  // Stripe
  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_PUBLISHABLE_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  STRIPE_API_VERSION?: string;

  @IsString()
  @IsOptional()
  STRIPE_CONNECT_API_VERSION?: string;

  @IsString()
  @IsOptional()
  STRIPE_DEFAULT_CURRENCY?: string;

  @IsString()
  @IsOptional()
  STRIPE_CONNECT_RETURN_URL?: string;

  @IsString()
  @IsOptional()
  STRIPE_CONNECT_REFRESH_URL?: string;

  // Firebase Admin (push notifications)
  @IsString()
  @IsOptional()
  FIREBASE_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  FIREBASE_CLIENT_EMAIL?: string;

  @IsString()
  @IsOptional()
  FIREBASE_PRIVATE_KEY?: string;

  // URLs externas
  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;

  @IsString()
  @IsOptional()
  API_URL?: string;
}
