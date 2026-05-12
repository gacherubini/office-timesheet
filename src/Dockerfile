FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3333
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"]
