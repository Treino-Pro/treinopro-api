# Etapa 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia apenas o necessário para instalar deps
COPY package.json yarn.lock ./

# Instala TODAS as dependências (inclui dev deps)
RUN yarn install --frozen-lockfile

# Copia o resto do código
COPY . .

# Build do projeto (gera dist/)
RUN yarn build


# Etapa 2: Execução
FROM node:20-alpine AS runner

WORKDIR /app

# Copia apenas o necessário da etapa de build
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/dist ./dist

# Instala apenas dependências de produção
RUN yarn install --production --frozen-lockfile

# Define a porta exposta
EXPOSE 3000

# Comando de inicialização
CMD ["node", "dist/src/main.js"]
