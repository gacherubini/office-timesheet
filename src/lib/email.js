import { Resend } from 'resend'
import { logger } from './logger.js'

const apiKey = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM || ''

const resend = apiKey ? new Resend(apiKey) : null

// Em dev não há provedor de e-mail: o link de reset só existe no terminal. Mas
// ele carrega um token de troca de senha (quem tem o link toma a conta) e o
// destinatário é um e-mail pessoal — nada disso pode passar pelo logger, que em
// produção vai pro Axiom e guarda por 30 dias. Então o link vai direto no
// stdout, fora do log estruturado, e só fora de produção. O logger registra o
// evento, sem o dado.
const imprimeLinkNoTerminal =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

export function assertResetEmailConfig(resetUrl) {
  if (!isProduction()) return
  if (!apiKey || !resend) {
    throw new Error('RESEND_API_KEY não configurada.')
  }
  if (!FROM || FROM.includes('resend.dev')) {
    throw new Error('RESEND_FROM não configurada (não use o remetente sandbox).')
  }
  if (!resetUrl || !/^https?:\/\/.+/i.test(resetUrl)) {
    throw new Error('FRONTEND_URL ausente ou inválida para montar o link de reset.')
  }
}

export async function sendResetEmail(to, resetUrl) {
  assertResetEmailConfig(resetUrl)

  if (!resend) {
    logger.info('Provedor de e-mail não configurado — reset não enviado')
    if (imprimeLinkNoTerminal) process.stdout.write(`\n[DEV] link de reset: ${resetUrl}\n\n`)
    return
  }

  const from = FROM || 'onboarding@resend.dev'
  const { error } = await resend.emails.send({
    from: `Office Timesheet <${from}>`,
    to,
    subject: 'Redefinição de senha',
    html: `
      <p>Você solicitou a redefinição da sua senha.</p>
      <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>
      <p>Se não foi você, ignore este e-mail.</p>
    `,
  })

  if (error) {
    logger.error(
      { err: { message: error.message || String(error), name: error.name } },
      'Falha ao enviar e-mail de reset',
    )
    throw new Error('Falha ao enviar e-mail de redefinição.')
  }
}
