// Espelha PUT /tasks/:id (requireAuth, qualquer logado), recorte fino: título,
// prioridade, responsável, prazo ou etapa. Sem description. Responsável
// vazio ou "ninguém" desatribui. Pelo menos um campo de mudança.
//
// CAMPO DE ETAPA: aplicarEdicaoTask (lib/taskEdits.js) já aceita stage_id no
// patch — mover uma tarefa já existente para outra etapa tem endpoint desde
// que o PUT /tasks/:id ganhou suporte. Esta tool resolve a etapa pelo NOME
// dentro do projeto da tarefa (resolverEtapa, tools/etapas.js — mesmo padrão
// de resolverPessoa em tools/pessoas.js: nome ambíguo ou inexistente vira erro
// legível), porque a mesma etapa se repete em várias obras.
import { resolverTarefa } from '../tarefas.js'
import { resolverPessoa } from '../pessoas.js'
import { resolverEtapa } from '../etapas.js'
import { aplicarEdicaoTask, VALID_PRIORITY } from '../../../taskEdits.js'
import { formatDateBR } from '../../format.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_editar_task',
    description: 'Propõe editar título, prioridade, responsável, prazo ou etapa de uma tarefa. Requer confirmação. Responsável vazio ou "ninguém" desatribui.',
    parameters: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'nome do projeto (opcional, para desambiguar a tarefa)' },
        tarefa: { type: 'string', description: 'título da tarefa' },
        titulo: { type: 'string', description: 'novo título' },
        prioridade: { type: 'string', enum: VALID_PRIORITY, description: 'low, medium ou high' },
        responsavel: { type: 'string', description: 'nome da pessoa; vazio ou "ninguém" desatribui' },
        prazo: { type: 'string', description: 'prazo YYYY-MM-DD; vazio limpa o prazo' },
        etapa: { type: 'string', description: 'nome da nova etapa (dentro do projeto da tarefa)' },
      },
      required: ['tarefa'],
      additionalProperties: false,
    },
  },
}

function desatribui(nome) {
  const t = (nome ?? '').trim()
  return t === '' || /^ningu[eé]m$/i.test(t)
}

// prazo é YYYY-MM-DD ou vazio (§9.8). Round-trip pelo ISO porque regex sozinha
// deixa passar 2026-02-31 (o JS rola pra março e o Postgres é que recusa).
const ISO = /^\d{4}-\d{2}-\d{2}$/
function dataISOValida(s) {
  if (!ISO.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

async function propose(_profile, args) {
  const temTitulo = args?.titulo !== undefined
  const temPrioridade = args?.prioridade !== undefined
  const temResponsavel = args?.responsavel !== undefined
  const temPrazo = args?.prazo !== undefined
  const temEtapa = args?.etapa !== undefined
  if (!temTitulo && !temPrioridade && !temResponsavel && !temPrazo && !temEtapa) {
    throw new Error('Informe ao menos um campo para alterar (título, prioridade, responsável, prazo ou etapa).')
  }
  if (temTitulo && !(args.titulo || '').trim()) {
    throw new Error('O título não pode ser vazio.')
  }
  if (temPrioridade && !VALID_PRIORITY.includes(args.prioridade)) {
    throw new Error('Prioridade inválida. Use low, medium ou high.')
  }

  const tarefa = await resolverTarefa(args?.tarefa, { projeto: args?.projeto, acao: 'editar a tarefa' })
  const patch = {}
  const dados = { projeto: tarefa.project_name, tarefa: tarefa.title }

  if (temTitulo) {
    patch.title = args.titulo.trim()
    dados.titulo = patch.title
  }
  if (temPrioridade) {
    patch.priority = args.prioridade
    dados.prioridade = args.prioridade
  }
  if (temResponsavel) {
    if (desatribui(args.responsavel)) {
      patch.assignee_id = null
      dados.responsável = 'ninguém'
    } else {
      const pessoa = await resolverPessoa(args.responsavel, { acao: 'atribuir a tarefa' })
      patch.assignee_id = pessoa.id
      dados.responsável = pessoa.name
    }
  }
  if (temPrazo) {
    const raw = args.prazo == null ? '' : String(args.prazo).trim()
    if (raw && !dataISOValida(raw)) {
      throw new Error('Prazo inválido. Use uma data no formato AAAA-MM-DD, ou deixe vazio para tirar o prazo.')
    }
    patch.due_date = raw || null
    dados.prazo = patch.due_date ? formatDateBR(patch.due_date) : 'sem prazo'
  }
  if (temEtapa) {
    // Diferente de responsável/prazo, etapa não tem "esvaziar": toda tarefa
    // pertence a uma etapa (stage_id é NOT NULL desde a migration 051).
    const nomeEtapa = (args.etapa || '').trim()
    if (!nomeEtapa) throw new Error('Diga o nome da nova etapa.')
    const etapa = await resolverEtapa(nomeEtapa, { id: tarefa.project_id, name: tarefa.project_name })
    patch.stage_id = etapa.id
    dados.etapa = etapa.name
  }

  return {
    kind: 'editar_task',
    payload: { task_id: tarefa.id, ...patch },
    descricao: `Editar a tarefa "${tarefa.title}" do projeto "${tarefa.project_name}".`,
    dados,
  }
}

async function execute(profile, payload) {
  const { task_id: taskId, ...patch } = payload
  const after = await aplicarEdicaoTask(taskId, patch, profile.id)
  return { before: { id: taskId }, after }
}

export default {
  kind: 'write',
  espelha: 'PUT /tasks/:id',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition, propose, execute,
}
