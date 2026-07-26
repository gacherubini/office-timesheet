import pino from 'pino'

// Logger único da API. O destino muda por ambiente:
//   test  → array em memória (não polui a saída e os testes conseguem inspecionar)
//   dev   → pino-pretty, colorido e legível no terminal
//   prod  → stdout em JSON (o Axiom entra na Task 5)
const env = process.env.NODE_ENV
const isTest = env === 'test'
const isProd = env === 'production'

// Caminhos censurados antes de qualquer serialização. Sem isso o JWT de um
// admin sairia em texto puro para um serviço de terceiros.
export const REDACT_PATHS = [
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'senha',
  'token',
  'newPassword',
  '*.password',
  '*.senha',
  '*.token',
  '*.newPassword',
]

const redact = { paths: REDACT_PATHS, censor: '[Redacted]' }

// Sink de teste: cada linha logada vira um objeto aqui.
export const testSink = []
export function clearTestSink() {
  testSink.length = 0
}

const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug')

function build() {
  if (isTest) {
    const stream = {
      write: (line) => {
        testSink.push(JSON.parse(line))
      },
    }
    return pino({ level: 'debug', redact, base: undefined }, stream)
  }

  if (!isProd) {
    return pino({
      level,
      redact,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    })
  }

  // Produção: sempre stdout (visível no `fly logs`) e, se configurado, também o
  // Axiom. O envio é best-effort: token errado ou serviço fora do ar não pode
  // derrubar request nem travar a API — os logs seguem saindo no stdout.
  const targets = [{ target: 'pino/file', options: { destination: 1 }, level }]

  const token = process.env.AXIOM_TOKEN
  const dataset = process.env.AXIOM_DATASET
  if (token && dataset) {
    targets.push({ target: '@axiomhq/pino', options: { token, dataset }, level })
  }

  return pino({ level, redact }, pino.transport({ targets }))
}

export const logger = build()
