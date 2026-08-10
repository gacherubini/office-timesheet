// O app roda em ESM puro (`node server.js`), mas o Vitest faz interop CJS→ESM
// antes de entregar os módulos. Isso já escondeu um `import { Parser } from
// 'node-sql-parser'` que passava em toda a suíte e derrubava o servidor no boot.
// Este teste sobe um `node` de verdade e só importa o app: é o único lugar onde
// a resolução de módulo é a mesma da produção.
import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Env mínima só para os módulos que validam config no import (db.js exige
// DATABASE_URL). Nada conecta: o pool do pg só abre socket na primeira query.
const ENV = {
  ...process.env,
  DATABASE_URL: 'postgres://boot:boot@127.0.0.1:5432/boot_check',
  JWT_SECRET: 'boot-check',
}

async function importaEmNodePuro(especificador) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['-e', `import(${JSON.stringify(especificador)}).then(() => console.log('OK'))`],
    { cwd: SRC_DIR, env: ENV, timeout: 30_000 },
  )
  return stdout.trim()
}

describe('boot em ESM puro (fora do interop do Vitest)', () => {
  it('app.js importa sem erro de módulo', async () => {
    await expect(importaEmNodePuro('./app.js')).resolves.toBe('OK')
  }, 30_000)

  it('o grafo do agente (registry → tools → guard) importa sem erro de módulo', async () => {
    await expect(importaEmNodePuro('./lib/agent/tools/registry.js')).resolves.toBe('OK')
  }, 30_000)
})
