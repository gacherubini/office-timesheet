import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'

const resend = apiKey ? new Resend(apiKey) : null

export async function sendResetEmail(to, resetUrl) {
  if (!resend) {
    console.log(`[DEV] Reset link para ${to}: ${resetUrl}`)
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
    console.error('Falha ao enviar e-mail de reset:', err)
  }
}
