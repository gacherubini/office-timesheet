import { describe, it, expect, beforeEach } from 'vitest'
import { sendResetEmail } from '../../lib/email.js'
import { testSink, clearTestSink } from '../../lib/logger.js'

// Sem RESEND_API_KEY (o caso do dev e o do teste) o envio é pulado. O que não
// pode acontecer é o link — que é um token de troca de senha — ou o e-mail do
// usuário caírem no logger, que em produção despeja tudo no Axiom.
describe('sendResetEmail — sem provedor configurado', () => {
  const email = 'pessoa.real@empresa.com'
  const resetUrl = 'https://app.exemplo.com/reset?token=abc123-token-de-troca-de-senha'

  beforeEach(() => clearTestSink())

  it('não loga o link de reset nem o e-mail do destinatário', async () => {
    await sendResetEmail(email, resetUrl)
    const bruto = JSON.stringify(testSink)

    expect(bruto).not.toContain(resetUrl)
    expect(bruto).not.toContain('abc123-token-de-troca-de-senha')
    expect(bruto).not.toContain(email)
  })

  it('registra o evento, para o caso ficar visível no log center', async () => {
    await sendResetEmail(email, resetUrl)

    expect(testSink).toHaveLength(1)
    expect(testSink[0].msg).toContain('Provedor de e-mail não configurado')
  })
})
