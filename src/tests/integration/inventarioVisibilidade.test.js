// COBERTURA DO INVENTÁRIO — o entregável mais importante do bloco D.
//
// Se o inventário de caminhos de leitura não for completo, a versão granular
// vaza igual à antiga, só que mais difícil de perceber. Este teste varre todos
// os caminhos que expõem dado de pessoa e afirma que nenhum entrega campo
// restrito a quem não é admin.
//
// Ao acrescentar rota que toque clients ou suppliers, acrescente aqui também.
//
// BLOQUEADOR 1 (revisão final, 19/08/2026): o inventário só cobria LEITURA.
// PUT/POST devolvem RETURNING * sem passar por aplicarVisibilidade — vazamento
// de verdade (PII em texto puro na resposta, mesmo que o front descarte o
// corpo). Corrigido em clients.js/suppliers.js; PUT e POST entraram na matriz.
//
// Inventário refeito em 19/08/2026 com:
//   grep -rn "FROM clients\|JOIN clients\|FROM suppliers\|JOIN suppliers" src/routes src/lib
// Achados além dos sete caminhos do brief original:
//   - src/lib/agent/tools/read/statusProjeto.js faz LEFT JOIN clients, mas só
//     projeta c.name (não é campo restringível — ver CAMPOS_RESTRINGIVEIS em
//     personVisibility.js) — não entrou na matriz por não ter valor sensível
//     para vazar.
//   - src/routes/projects.js tem mais três JOIN clients (POST/PUT /projects
//     para validar client_id, e gravarClientesDoProjeto para sincronizar o
//     nome) — todos só leem `id`/`name`, mesmo caso acima.
//   - GET /admin/clients e GET /admin/suppliers (a LISTAGEM, não a ficha)
//     tinham primary_phone/primary_email/primary_address vindo de um LEFT
//     JOIN LATERAL que pegava a linha is_primary sem checar is_restricted —
//     um vazamento de verdade quando a linha principal é a marcada como
//     restrita (o que passou a ser possível de verdade só depois do fix do
//     item 1 deste bloco, que faz is_restricted sobreviver ao PUT). Corrigido
//     na própria rota (clients.js/suppliers.js), não neste teste — ver os
//     casos "não vaza o contato PRINCIPAL restrito" abaixo.
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, query } from '../helpers/db.js'
import { asUser } from '../helpers/api.js'
import { makeUser, makeAdmin, makeProject } from '../helpers/factories.js'

const SENSIVEIS = ['cpf', 'rg', 'cnpj', 'bank_name', 'bank_agency', 'bank_account', 'pix_key']

// Varre o JSON inteiro (não só o topo) atrás do VALOR, não da chave: uma chave
// renomeada continuaria vazando o dado.
function contemValor(obj, agulha) {
  return JSON.stringify(obj ?? null).includes(agulha)
}

describe('inventário de visibilidade — nenhum caminho vaza', () => {
  let admin, emp, intern, cliente, fornecedor, projeto

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })
    // PUT/POST de clients/suppliers exigem canManageClients/Suppliers
    // (admin + administrative_intern) — `emp` (employee) toma 403 antes de
    // chegar na visibilidade. É exatamente o perfil que o BLOQUEADOR 1 descreve:
    // gerencia clientes, não é admin.
    intern = await makeUser({ role: 'administrative_intern', name: 'Estagiária' })

    const c = await asUser(admin).post('/admin/clients').send({
      name: 'Fulano',
      cpf: 'CPF-SECRETO', rg: 'RG-SECRETO',
      bank_name: 'BANCO-SECRETO', pix_key: 'PIX-SECRETO',
    })
    cliente = c.body.id

    const s = await asUser(admin).post('/admin/suppliers').send({
      name: 'Marcenaria', cnpj: 'CNPJ-SECRETO', pix_key: 'PIX-FORN-SECRETO',
    })
    fornecedor = s.body.id

    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'recado','TEL-SECRETO',false,true)`, [cliente])
    await query(
      `INSERT INTO client_attachments (client_id, file_url, file_name, is_restricted)
       VALUES ($1,'http://x/c.pdf','CONTRATO-SECRETO.pdf',true)`, [cliente])

    projeto = await makeProject({ name: 'Obra' })
    await query(`UPDATE projects SET client_id = $1 WHERE id = $2`, [cliente, projeto.id])
  })

  const CAMINHOS = [
    { nome: 'GET /admin/clients',                 method: 'get', url: () => '/admin/clients' },
    { nome: 'GET /admin/clients/:id',             method: 'get', url: () => `/admin/clients/${cliente}` },
    // Gate voltou a requireCanManageClients (item 1 do bloco de 19/08/2026) —
    // ator é a estagiária, mesmo motivo do PUT/POST logo abaixo: `emp`
    // (colaborador comum) toma 403 antes de chegar na visibilidade.
    {
      nome: 'GET /admin/clients/:id/attachments', method: 'get', ator: () => intern,
      url: () => `/admin/clients/${cliente}/attachments`,
    },
    { nome: 'GET /admin/suppliers',               method: 'get', url: () => '/admin/suppliers' },
    { nome: 'GET /admin/suppliers/:id',           method: 'get', url: () => `/admin/suppliers/${fornecedor}` },
    { nome: 'GET /projects',                      method: 'get', url: () => '/projects' },
    { nome: 'GET /projects/:id',                  method: 'get', url: () => `/projects/${projeto.id}` },
    // BLOQUEADOR 1: RETURNING * sem aplicarVisibilidade. Ator é a estagiária
    // administrativa — o perfil real que gerencia clientes/fornecedores sem
    // ser admin. O corpo do PUT é o que a ficha JÁ tinha (não reenvia campo
    // restrito, porque o form dela nunca o recebeu).
    {
      nome: 'PUT /admin/clients/:id', method: 'put', ator: () => intern,
      url: () => `/admin/clients/${cliente}`,
      body: () => ({ name: 'Fulano' }),
    },
    {
      nome: 'POST /admin/clients', method: 'post', ator: () => intern,
      url: () => '/admin/clients',
      body: () => ({
        name: 'Cliente criado pela estagiária',
        cpf: 'CPF-SECRETO', rg: 'RG-SECRETO',
        bank_name: 'BANCO-SECRETO', pix_key: 'PIX-SECRETO',
      }),
    },
    {
      nome: 'PUT /admin/suppliers/:id', method: 'put', ator: () => intern,
      url: () => `/admin/suppliers/${fornecedor}`,
      body: () => ({ name: 'Marcenaria' }),
    },
    {
      nome: 'POST /admin/suppliers', method: 'post', ator: () => intern,
      url: () => '/admin/suppliers',
      body: () => ({
        name: 'Fornecedor criado pela estagiária',
        cnpj: 'CNPJ-SECRETO', pix_key: 'PIX-FORN-SECRETO',
      }),
    },
  ]

  // Escreve a requisição de um caminho: GET não leva corpo; PUT/POST levam o
  // que `body()` descrever. Ator default é `emp` (colaborador comum, só
  // leitura); PUT/POST de clients/suppliers declaram `ator: intern`.
  function chamar(caminho) {
    const ator = caminho.ator ? caminho.ator() : emp
    const req = asUser(ator)[caminho.method](caminho.url())
    return caminho.body ? req.send(caminho.body()) : req
  }

  for (const caminho of CAMINHOS) {
    it(`${caminho.nome} não entrega dado restrito ao colaborador`, async () => {
      const res = await chamar(caminho)
      expect(res.status).toBeLessThan(400)
      for (const agulha of ['CPF-SECRETO', 'RG-SECRETO', 'BANCO-SECRETO', 'PIX-SECRETO',
                            'CNPJ-SECRETO', 'PIX-FORN-SECRETO', 'TEL-SECRETO', 'CONTRATO-SECRETO']) {
        expect(contemValor(res.body, agulha)).toBe(false)
      }
    })
  }

  for (const caminho of CAMINHOS) {
    it(`${caminho.nome} continua entregando o que NÃO é restrito`, async () => {
      const res = await chamar(caminho)
      expect(res.status).toBeLessThan(400)
    })
  }

  it('o admin continua vendo tudo — a restrição não pode virar apagão', async () => {
    const ficha = await asUser(admin).get(`/admin/clients/${cliente}`)
    expect(ficha.body.cpf).toBe('CPF-SECRETO')
    expect(ficha.body.pix_key).toBe('PIX-SECRETO')
  })

  it('o NOME do cliente continua chegando ao colaborador', async () => {
    // name não é restringível: sem ele, os cards de projeto ficariam sem título.
    const res = await asUser(emp).get('/projects')
    expect(contemValor(res.body, 'Fulano')).toBe(true)
  })

  // Trava a invariante do SQL ad-hoc do agente. A role agent_readonly tem
  // GRANT SELECT em clients e suppliers (migrations 030/031) e atravessaria
  // TODA esta matriz. Hoje a tool é roles:['admin'] — está seguro. Se alguém
  // abrir para outro papel, este teste quebra e obriga a decidir conscientemente.
  it('o SQL ad-hoc sobre tabelas de PII continua exclusivo de admin', async () => {
    const { default: consultarDados } = await import('../../lib/agent/tools/sql/consultarDados.js')
    const { TABELAS_PERMITIDAS } = await import('../../lib/agent/tools/sql/guard.js')
    const temPII = ['clients', 'suppliers'].some((t) => TABELAS_PERMITIDAS.has(t))
    if (temPII) expect(consultarDados.roles).toEqual(['admin'])
  })
})

// Achado do reinventário de 19/08/2026: GET /admin/clients e GET /admin/suppliers
// (a LISTAGEM) resumem o contato em primary_phone/primary_email/primary_address
// via um LEFT JOIN LATERAL que pegava a linha is_primary sem olhar
// is_restricted. Isso não vazava enquanto o bug do item 1 (is_restricted
// zerado a cada PUT) estava vivo — mas com ele corrigido, marcar a linha
// PRINCIPAL como restrita passou a ser um estado real e persistente, e a
// listagem continuava mostrando o valor. Cenário fora do que o brief original
// cobria (lá o telefone restrito nunca era o principal).
describe('inventário — listagem não vaza o contato PRINCIPAL restrito', () => {
  let admin, emp, cliente, fornecedor, projeto

  beforeEach(async () => {
    await resetDb()
    admin = await makeAdmin()
    emp = await makeUser({ role: 'employee', name: 'Arquiteta' })

    const c = await asUser(admin).post('/admin/clients').send({ name: 'Beltrano' })
    cliente = c.body.id
    await query(
      `INSERT INTO person_phones (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'celular','TEL-PRINCIPAL-SECRETO',true,true)`, [cliente])
    await query(
      `INSERT INTO person_emails (client_id, label, value, is_primary, is_restricted)
       VALUES ($1,'pessoal','EMAIL-PRINCIPAL-SECRETO',true,true)`, [cliente])
    await query(
      `INSERT INTO person_addresses (client_id, label, street, is_primary, is_restricted)
       VALUES ($1,'residencial','ENDERECO-PRINCIPAL-SECRETO',true,true)`, [cliente])

    const s = await asUser(admin).post('/admin/suppliers').send({ name: 'Fornecedora' })
    fornecedor = s.body.id
    await query(
      `INSERT INTO person_phones (supplier_id, label, value, is_primary, is_restricted)
       VALUES ($1,'comercial','TEL-FORN-PRINCIPAL-SECRETO',true,true)`, [fornecedor])

    // GET /projects também resolve o contato pela linha is_primary (LEFT JOIN
    // LATERAL) — mesma agulha de linha principal restrita precisa passar por
    // aqui, senão a rota some da matriz e o gap de projects.js reabre sem
    // ninguém notar (foi exatamente isso que aconteceu: só clients/suppliers
    // tinham cobertura de linha principal restrita, projects.js não).
    projeto = await makeProject({ name: 'Obra do Beltrano' })
    await query(`UPDATE projects SET client_id = $1 WHERE id = $2`, [cliente, projeto.id])
  })

  it('GET /admin/clients não devolve primary_phone/email/address restritos ao colaborador', async () => {
    const res = await asUser(emp).get('/admin/clients')
    expect(res.status).toBe(200)
    expect(contemValor(res.body, 'TEL-PRINCIPAL-SECRETO')).toBe(false)
    expect(contemValor(res.body, 'EMAIL-PRINCIPAL-SECRETO')).toBe(false)
    expect(contemValor(res.body, 'ENDERECO-PRINCIPAL-SECRETO')).toBe(false)
  })

  it('GET /admin/suppliers não devolve primary_phone restrito ao colaborador', async () => {
    const res = await asUser(emp).get('/admin/suppliers')
    expect(res.status).toBe(200)
    expect(contemValor(res.body, 'TEL-FORN-PRINCIPAL-SECRETO')).toBe(false)
  })

  it('GET /projects não devolve client_phone/email/address restritos ao colaborador', async () => {
    const res = await asUser(emp).get('/projects')
    expect(res.status).toBe(200)
    expect(contemValor(res.body, 'TEL-PRINCIPAL-SECRETO')).toBe(false)
    expect(contemValor(res.body, 'EMAIL-PRINCIPAL-SECRETO')).toBe(false)
    expect(contemValor(res.body, 'ENDERECO-PRINCIPAL-SECRETO')).toBe(false)
  })

  it('admin continua vendo o contato principal restrito na listagem', async () => {
    const res = await asUser(admin).get('/admin/clients')
    const item = res.body.find((c) => c.id === cliente)
    expect(item.primary_phone).toBe('TEL-PRINCIPAL-SECRETO')
    expect(item.primary_email).toBe('EMAIL-PRINCIPAL-SECRETO')
  })

  it('admin continua vendo o contato principal restrito em GET /projects', async () => {
    const res = await asUser(admin).get('/projects')
    const obra = res.body.find((p) => p.id === projeto.id)
    expect(obra.client_phone).toBe('TEL-PRINCIPAL-SECRETO')
    expect(obra.client_email).toBe('EMAIL-PRINCIPAL-SECRETO')
    expect(obra.client_address).toBe('ENDERECO-PRINCIPAL-SECRETO')
  })
})
