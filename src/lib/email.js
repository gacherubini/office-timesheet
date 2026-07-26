import { Resend } from 'resend'
import { logger } from './logger.js'

const apiKey = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'

const resend = apiKey ? new Resend(apiKey) : null

// Em dev não há provedor de e-mail: o link de reset só existe no terminal. Mas
// ele carrega um token de troca de senha (quem tem o link toma a conta) e o
// destinatário é um e-mail pessoal — nada disso pode passar pelo logger, que em
// produção vai pro Axiom e guarda por 30 dias. Então o link vai direto no
// stdout, fora do log estruturado, e só fora de produção. O logger registra o
// evento, sem o dado.
const imprimeLinkNoTerminal =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'

export async function sendResetEmail(to, resetUrl) {
  if (!resend) {
    logger.info('Provedor de e-mail não configurado — reset não enviado')
    if (imprimeLinkNoTerminal) process.stdout.write(`\n[DEV] link de reset: ${resetUrl}\n\n`)
    return
  }
  try {
    await resend.emails.send({
      from: `Office Timesheet <${FROM}>`,
      to,
      subject: 'Redefinição de senha',
      html: `
        <p>Você solicitou a redefinição da sua senha.</p>
        <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>
        <p>Se não foi você, ignore este e-mail.</p>
      `,
    })
  } catch (err) {
    logger.error({ err: { message: err.message, stack: err.stack } }, 'Falha ao enviar e-mail de reset')
  }
}
