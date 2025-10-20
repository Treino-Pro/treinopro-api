# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas o necessário para instalar dependências
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copia todo o código
COPY . .

# Build do projeto (gera dist/)
RUN yarn build


# Etapa 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Instala cliente Postgres para checagem de readiness
RUN apk add --no-cache postgresql-client bash

# Copia arquivos essenciais da etapa de build
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src ./src

# Instala apenas dependências de produção
RUN yarn install --production --frozen-lockfile

EXPOSE 3000

# Aguarda Postgres estar pronto antes de rodar migrations e iniciar app
CMD ["sh", "-c", "\
  until pg_isready -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER -d $DATABASE_NAME; do \
    echo '⏳ Aguardando Postgres...'; sleep 2; \
  done; \
  echo '✅ Postgres pronto! Rodando migrations...'; \
  npx drizzle-kit push:pg; \
  echo '🚀 Iniciando aplicação'; \
  node dist/src/main.js \
"]

