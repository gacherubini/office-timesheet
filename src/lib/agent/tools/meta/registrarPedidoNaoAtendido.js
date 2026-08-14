// Tool de "auto-registro": o agente a chama quando o usuário pede uma ação/dado
// que NENHUMA outra ferramenta cobre. Grava o pedido pra virar backlog do
// programador. kind 'meta' → o loop executa inline (como leitura), sem proposta.
import { insert } from '../../featureRequestsRepo.js'

const definition = {
  type: 'function',
  function: {
    name: 'registrar_pedido_nao_atendido',
    description: 'Registra um pedido do usuário que nenhuma ferramenta disponível cobre — uma capacidade ou dado que o produto ainda não faz. Chame ANTES de dizer que não consegue, quando a pessoa pede uma ação/informação real e concreta que não existe como ferramenta. NÃO use para pergunta ambígua (peça esclarecimento) nem para dado que você consegue obter com outra ferramenta.',
    parameters: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'a capacidade que faltou, em uma frase (ex.: "exportar apontamentos para Excel")' },
        texto_original: { type: 'string', description: 'a pergunta original do usuário, o mais fiel possível' },
      },
      required: ['descricao'],
      additionalProperties: false,
    },
  },
}

async function run(profile, args) {
  const descricao = (args?.descricao || '').trim()
  if (!descricao) throw new Error('descricao é obrigatória')
  await insert({
    userId: profile?.id,
    role: profile?.role,
    descricao,
    textoOriginal: (args?.texto_original || '').trim() || null,
  })
  return { ok: true, aviso: 'Pedido anotado para o time. Diga ao usuário que você ainda não faz isso, mas que a solicitação foi registrada.' }
}

export default {
  kind: 'meta',
  roles: ['admin', 'administrative_intern', 'project_manager', 'employee'],
  definition,
  run,
}
