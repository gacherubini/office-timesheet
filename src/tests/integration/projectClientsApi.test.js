import { describe, it, expect, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeAdmin, makeUser } from '../helpers/factories.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function cliente(admin, nome) {
  const res = await asUser(admin).post('/admin/clients').send({ name: nome })
  return res.body.id
}

describe('API — vários contratantes por projeto', () => {
  let admin, luiz, marina
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    luiz = await cliente(admin, 'Luiz Eduardo')
    marina = await cliente(admin, 'Marina')
  })

  it('cria projeto com dois contratantes', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients).toHaveLength(2)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  // A invariante que mantém os leitores antigos funcionando.
  it('projects.client_id acompanha o contratante principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
      ],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(luiz)
    expect(rows[0].client).toBe('Luiz Eduardo')
  })

  // Trocar o principal é trocar o PAPEL — desde a fusão do rádio com o Select
  // não existe mais um `is_primary` que o usuário marque à parte.
  it('trocar o principal atualiza projects.client_id', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, role: 'contratante_principal' }, { client_id: marina }],
    })
    await asUser(admin).put(`/projects/${res.body.id}`).send({
      clients: [{ client_id: luiz }, { client_id: marina, role: 'contratante_principal' }],
    })
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(marina)
    expect(rows[0].client).toBe('Marina')
  })

  it('promove o primeiro quando nenhum é marcado principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz }, { client_id: marina }],
    })
    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients.find((c) => c.is_primary).name).toBe('Luiz Eduardo')
  })

  it('recusa dois principais com mensagem legível', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal' },
        { client_id: marina, role: 'contratante_principal' },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um.*principal/i)
  })

  it('recusa projeto sem nenhum cliente', async () => {
    const res = await asUser(admin).post('/projects').send({ name: 'Obra', start_date: '2026-08-01', clients: [] })
    expect(res.status).toBe(400)
  })

  it('recusa projeto sem data de início', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      clients: [{ client_id: luiz, is_primary: true }],
    })
    expect(res.status).toBe(400)
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('recusa papel inválido antes de tocar no banco', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra', start_date: '2026-08-01', clients: [{ client_id: luiz, role: 'padrinho' }],
    })
    expect(res.status).toBe(400)
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('o contador da ficha da pessoa conta todos os papéis', async () => {
    const investidor = await cliente(admin, 'Investidor')
    await asUser(admin).post('/projects').send({
      name: 'Obra A',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: investidor, role: 'investidor' }],
    })
    await asUser(admin).post('/projects').send({
      name: 'Obra B',
      start_date: '2026-08-01',
      clients: [{ client_id: investidor, role: 'investidor', is_primary: true }],
    })
    const ficha = await asUser(admin).get(`/admin/clients/${investidor}`)
    expect(ficha.body.project_count).toBe(2)
  })

  it('o projeto aparece na ficha dos dois contratantes', async () => {
    await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, is_primary: true }, { client_id: marina, role: 'contratante' }],
    })
    for (const id of [luiz, marina]) {
      const ficha = await asUser(admin).get(`/admin/clients/${id}`)
      expect(ficha.body.projects.map((p) => p.name)).toContain('Grand Terroir 31')
    }
  })

  // Bug real: o modal de edição abre otimista com só o principal (a listagem
  // não traz os outros contratantes) enquanto busca a ficha completa em
  // paralelo. Se o usuário salvar antes dessa resposta chegar — ou se ela
  // falhar — o PUT não pode mandar `clients` incompleto e apagar investidor e
  // representante. Mesma regra de "chave ausente preserva" de
  // src/routes/clients.js (preservarLinhasInvisiveis/resolverRestricaoLinhas).
  it('PUT sem a chave clients preserva os vínculos existentes', async () => {
    const investidor = await cliente(admin, 'Investidor')
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    // PUT só mexe no nome — corpo nem toca em `clients`.
    const put = await asUser(admin).put(`/projects/${criado.body.id}`).send({ name: 'Grand Terroir 31 — Fase 2' })
    expect(put.status).toBe(200)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(3)
    expect(ficha.body.clients.map((c) => c.client_id).sort()).toEqual([investidor, luiz, marina].sort())
    expect(ficha.body.clients.find((c) => c.is_primary).client_id).toBe(luiz)
  })

  it('PUT com a chave clients substitui os vínculos', async () => {
    const investidor = await cliente(admin, 'Investidor')
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: marina, role: 'contratante' },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const put = await asUser(admin).put(`/projects/${criado.body.id}`).send({
      clients: [{ client_id: marina, role: 'contratante_principal', is_primary: true }],
    })
    expect(put.status).toBe(200)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients[0].client_id).toBe(marina)
  })
})

// Item 2 do bloco de 19/08/2026: um investidor (vínculo SECUNDÁRIO)
// admin_only vazava o nome pelo clients[] de GET /projects/:id mesmo a ficha
// direta dele devolvendo 404 para quem não é admin.
describe('admin_only no clients[] de GET /projects/:id', () => {
  let admin, emp, luiz, investidor
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee' })
    luiz = await cliente(admin, 'Luiz Eduardo')
    const res = await asUser(admin).post('/admin/clients').send({ name: 'Investidor Oculto' })
    investidor = res.body.id
    await query(`UPDATE clients SET admin_only = true WHERE id = $1`, [investidor])
  })

  it('vínculo secundário admin_only some do clients[] para quem não é admin', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(emp).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients.map((c) => c.client_id)).not.toContain(investidor)
    expect(JSON.stringify(ficha.body)).not.toContain('Investidor Oculto')
  })

  it('vínculo secundário admin_only continua aparecendo para o admin', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal', is_primary: true },
        { client_id: investidor, role: 'investidor' },
      ],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${criado.body.id}`)
    expect(ficha.body.clients.map((c) => c.client_id)).toContain(investidor)
  })

  // O contratante PRINCIPAL não é afetado pelo gate — mesmo admin_only, ele
  // segue titulando o card (projects.client, coluna denormalizada) e
  // continua aparecendo em clients[] (é a mesma pessoa que já titula o card
  // sem restrição — escondê-la só do array deixaria a ficha inconsistente).
  it('contratante principal admin_only não some — o card não fica sem título', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Grand Terroir 31',
      start_date: '2026-08-01',
      clients: [{ client_id: investidor, role: 'contratante_principal', is_primary: true }],
    })
    expect(criado.status).toBe(201)

    const ficha = await asUser(emp).get(`/projects/${criado.body.id}`)
    expect(ficha.body.client).toBe('Investidor Oculto')
    expect(ficha.body.clients).toHaveLength(1)
    expect(ficha.body.clients[0].client_id).toBe(investidor)
  })
})

// Fusão do rádio com o Select (ajuste de 20/08/2026). A tela tinha DOIS
// controles dizendo a mesma coisa na mesma linha — um rádio "principal" e um
// Select cuja primeira opção era "Contratante principal" — e o dono do produto
// marcou vários rádios achando que era assim que se escolhem vários
// contratantes. O rádio saiu: quem tem o papel `contratante_principal` É o
// principal, e `is_primary` virou consequência, não escolha.
//
// Por que a rota também muda, e não só a tela: o corpo da requisição continua
// carregando `is_primary` (front antigo em cache, integração, o próprio
// agente). Se o servidor seguisse acreditando nesse campo, teríamos duas
// fontes de verdade discordando — exatamente a confusão que a fusão apagou.
describe('o papel manda: is_primary é derivado de role', () => {
  let admin, luiz, marina
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    luiz = await cliente(admin, 'Luiz Eduardo')
    marina = await cliente(admin, 'Marina')
  })

  it('o papel contratante_principal elege o principal mesmo sem is_primary no corpo', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante' },
        { client_id: marina, role: 'contratante_principal' },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients.find((c) => c.is_primary).client_id).toBe(marina)
    const { rows } = await query(`SELECT client_id, client FROM projects WHERE id = $1`, [res.body.id])
    expect(rows[0].client_id).toBe(marina)
    expect(rows[0].client).toBe('Marina')
  })

  // O contrário do teste acima, e o que de fato prova que a fonte de verdade
  // mudou: `is_primary: true` numa linha de investidor não elege ninguém.
  it('is_primary sozinho não elege — quem não tem o papel não vira principal', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante' },
        { client_id: marina, role: 'investidor', is_primary: true },
      ],
    })
    expect(res.status).toBe(201)

    const ficha = await asUser(admin).get(`/projects/${res.body.id}`)
    expect(ficha.body.clients.find((c) => c.client_id === marina).is_primary).toBe(false)
    expect(ficha.body.clients.find((c) => c.is_primary).client_id).toBe(luiz)
  })

  // A promoção precisa gravar PAPEL e is_primary juntos. Se só o is_primary
  // fosse setado, o banco ficaria com um principal cujo papel a tela não sabe
  // exibir — o formulário abriria sem principal nenhum e o usuário veria o
  // principal "pular" de linha ao salvar de novo.
  it('sem nenhum contratante_principal, o primeiro é promovido com papel e is_primary juntos', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [{ client_id: luiz, role: 'contratante' }, { client_id: marina, role: 'investidor' }],
    })
    expect(res.status).toBe(201)

    const { rows } = await query(
      `SELECT client_id, role, is_primary FROM project_clients WHERE project_id = $1`,
      [res.body.id])
    const principal = rows.find((r) => r.is_primary)
    expect(principal.client_id).toBe(luiz)
    expect(principal.role).toBe('contratante_principal')
    expect(rows.filter((r) => r.role === 'contratante_principal')).toHaveLength(1)
  })

  // O UNIQUE INDEX project_clients_um_principal continua sendo a última linha
  // de defesa, mas quem chega até ele já perdeu: o erro do Postgres é cru e
  // sai em inglês. A validação tem que barrar antes, em português.
  it('dois contratantes principais viram erro legível, não erro do Postgres', async () => {
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal' },
        { client_id: marina, role: 'contratante_principal' },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/apenas um.*principal/i)
    expect(res.body.error).not.toMatch(/duplicate|unique|constraint|project_clients_um_principal/i)

    // E nada foi gravado: a validação roda ANTES de abrir a transação.
    const { rows } = await query(`SELECT count(*)::int AS c FROM projects`)
    expect(rows[0].c).toBe(0)
  })

  it('o mesmo vale no PUT: trocar o papel troca o principal', async () => {
    const criado = await asUser(admin).post('/projects').send({
      name: 'Obra',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal' },
        { client_id: marina, role: 'contratante' },
      ],
    })
    const put = await asUser(admin).put(`/projects/${criado.body.id}`).send({
      clients: [
        { client_id: luiz, role: 'contratante' },
        { client_id: marina, role: 'contratante_principal' },
      ],
    })
    expect(put.status).toBe(200)

    const { rows } = await query(
      `SELECT client_id, role, is_primary FROM project_clients WHERE project_id = $1`,
      [criado.body.id])
    expect(rows.find((r) => r.is_primary).client_id).toBe(marina)
    expect(rows.find((r) => r.client_id === luiz).role).toBe('contratante')
  })
})

// A migration que alinha o que já está gravado. Sem ela, um projeto salvo
// ANTES da fusão — com um investidor marcado como principal, o que a tela
// antiga permitia — abriria no formulário sem principal nenhum, porque a tela
// nova lê o principal do papel.
describe('056 — o dado antigo precisa concordar com a regra nova', () => {
  let admin, luiz, marina, projeto
  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    luiz = await cliente(admin, 'Luiz Eduardo')
    marina = await cliente(admin, 'Marina')
    const res = await asUser(admin).post('/projects').send({
      name: 'Obra antiga',
      start_date: '2026-08-01',
      clients: [
        { client_id: luiz, role: 'contratante_principal' },
        { client_id: marina, role: 'contratante' },
      ],
    })
    projeto = res.body.id
  })

  // O SQL testado é lido do próprio arquivo de migration — não uma cópia que
  // pode divergir dele (mesma escolha de 054_backfill_cargo_colaborador).
  async function rodarMigration() {
    const sql = await readFile(
      path.resolve(__dirname, '../../migrations/056_papel_do_contratante_principal.sql'), 'utf8')
    await query(sql)
  }

  it('o principal com papel antigo passa a ser contratante_principal', async () => {
    // Estado que a tela antiga produzia: investidor marcado como principal.
    await query(
      `UPDATE project_clients SET role = 'investidor' WHERE project_id = $1 AND client_id = $2`,
      [projeto, luiz])
    await rodarMigration()

    const { rows } = await query(
      `SELECT role FROM project_clients WHERE project_id = $1 AND client_id = $2`, [projeto, luiz])
    expect(rows[0].role).toBe('contratante_principal')
  })

  it('não mexe em quem não é principal', async () => {
    await query(
      `UPDATE project_clients SET role = 'investidor' WHERE project_id = $1 AND client_id = $2`,
      [projeto, marina])
    await rodarMigration()

    const { rows } = await query(
      `SELECT role FROM project_clients WHERE project_id = $1 AND client_id = $2`, [projeto, marina])
    expect(rows[0].role).toBe('investidor')
  })
})
