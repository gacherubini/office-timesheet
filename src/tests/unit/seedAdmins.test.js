// Parser do seed de admins. A regra que importa aqui não é "aceitar o formato
// certo" — é RECUSAR ALTO o formato errado. Antes, config torta virava
// `SEED skip` no log e a API subia sem nenhum admin: produção de pé e ninguém
// consegue entrar. Cada caso de erro abaixo é um jeito real de digitar o secret
// errado no Fly.
import { describe, it, expect } from 'vitest'
import { parseAdminsSeed } from '../../scripts/migrate.js'

describe('parseAdminsSeed — INITIAL_ADMINS', () => {
  it('lê a lista completa, na ordem', () => {
    const admins = parseAdminsSeed({
      INITIAL_ADMINS: 'João Pedro|joaopedro@studiovivian.com.br|123456;'
        + 'Gabriel|bielcheeeeee@gmail.com|123456;'
        + 'Arquitetura|arquitetura@eniovivian.com.br|123456',
    })
    expect(admins).toEqual([
      { name: 'João Pedro', email: 'joaopedro@studiovivian.com.br', password: '123456' },
      { name: 'Gabriel', email: 'bielcheeeeee@gmail.com', password: '123456' },
      { name: 'Arquitetura', email: 'arquitetura@eniovivian.com.br', password: '123456' },
    ])
  })

  it('apara espaços e normaliza o e-mail para minúsculas', () => {
    const admins = parseAdminsSeed({ INITIAL_ADMINS: '  Ana  | ANA@Exemplo.COM.BR |  segredo123  ' })
    expect(admins).toEqual([{ name: 'Ana', email: 'ana@exemplo.com.br', password: 'segredo123' }])
  })

  it('tolera ponto-e-vírgula sobrando', () => {
    const admins = parseAdminsSeed({ INITIAL_ADMINS: 'Ana|ana@exemplo.com|123456;;' })
    expect(admins).toHaveLength(1)
  })

  it('sem variável nenhuma, não semeia', () => {
    expect(parseAdminsSeed({})).toEqual([])
  })
})

describe('parseAdminsSeed — compatibilidade com INITIAL_ADMIN_EMAIL/PASSWORD', () => {
  it('usa o par antigo quando INITIAL_ADMINS não existe', () => {
    const admins = parseAdminsSeed({
      INITIAL_ADMIN_EMAIL: 'Admin@Exemplo.com',
      INITIAL_ADMIN_PASSWORD: '123456',
    })
    expect(admins).toEqual([{ name: 'Admin', email: 'admin@exemplo.com', password: '123456' }])
  })

  it('INITIAL_ADMINS tem precedência sobre o par antigo', () => {
    const admins = parseAdminsSeed({
      INITIAL_ADMINS: 'Ana|ana@exemplo.com|123456',
      INITIAL_ADMIN_EMAIL: 'velho@exemplo.com',
      INITIAL_ADMIN_PASSWORD: '123456',
    })
    expect(admins).toEqual([{ name: 'Ana', email: 'ana@exemplo.com', password: '123456' }])
  })

  it('par antigo pela metade não semeia (era o comportamento antigo)', () => {
    expect(parseAdminsSeed({ INITIAL_ADMIN_EMAIL: 'admin@exemplo.com' })).toEqual([])
    expect(parseAdminsSeed({ INITIAL_ADMIN_PASSWORD: '123456' })).toEqual([])
  })
})

describe('parseAdminsSeed — recusa alto', () => {
  it('campo faltando', () => {
    expect(() => parseAdminsSeed({ INITIAL_ADMINS: 'Ana|ana@exemplo.com' }))
      .toThrow(/3 campos.*Nome\|email\|senha/s)
  })

  it('campo sobrando (senha com | dentro, por exemplo)', () => {
    expect(() => parseAdminsSeed({ INITIAL_ADMINS: 'Ana|ana@exemplo.com|12|3456' }))
      .toThrow(/3 campos/)
  })

  it('e-mail sem @', () => {
    expect(() => parseAdminsSeed({ INITIAL_ADMINS: 'Ana|ana-exemplo.com|123456' }))
      .toThrow(/e-mail inválido/i)
  })

  it('nome vazio', () => {
    expect(() => parseAdminsSeed({ INITIAL_ADMINS: '|ana@exemplo.com|123456' }))
      .toThrow(/nome vazio/i)
  })

  // O piso do app é 6 (routes/auth.js, reset-password). O seed não pode criar
  // uma senha que a própria tela de trocar senha recusaria.
  it('senha abaixo do piso de 6 do app', () => {
    expect(() => parseAdminsSeed({ INITIAL_ADMINS: 'Ana|ana@exemplo.com|12345' }))
      .toThrow(/senha.*6/i)
  })

  it('e-mail repetido na lista', () => {
    expect(() => parseAdminsSeed({
      INITIAL_ADMINS: 'Ana|ana@exemplo.com|123456;Outra|ANA@exemplo.com|123456',
    })).toThrow(/repetido/i)
  })

  it('a mensagem diz QUAL entrada está errada', () => {
    expect(() => parseAdminsSeed({
      INITIAL_ADMINS: 'Ana|ana@exemplo.com|123456;Bruno|bruno-exemplo.com|123456',
    })).toThrow(/entrada 2/i)
  })
})
