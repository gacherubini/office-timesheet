import { defineConfig } from 'vitest/config'

// DB e segredo de teste. Em CI/local via docker o DATABASE_URL vem do ambiente;
// senão cai no default (o Postgres do docker-compose.test.yml em localhost:5432).
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/office_timesheet_test'
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

// Propaga para o processo principal (globalSetup roda as migrações aqui).
process.env.DATABASE_URL = DATABASE_URL
process.env.JWT_SECRET = JWT_SECRET

export default defineConfig({
  test: {
    // Injeta no ambiente dos workers antes de db.js/jwt.js serem importados.
    env: { DATABASE_URL, JWT_SECRET, NODE_ENV: 'test' },
    globalSetup: ['./tests/setup/globalSetup.js'],
    include: ['tests/**/*.test.js'],
    // Um único banco compartilhado → roda serial pra evitar corrida entre testes.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
