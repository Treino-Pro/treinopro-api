# Use Node LTS
FROM node:20-alpine

# Diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package.json yarn.lock ./

# Instala dependências
RUN yarn install --production

# Copia o restante do código
COPY . .

# Build (para NestJS ou TypeScript)
RUN yarn build

# Expõe a porta que a API vai usar
EXPOSE 3000

# Comando de start
CMD ["node", "dist/src/main.js"]