// Laço de tool-calling agnóstico de canal. Recebe o cliente por parâmetro (o
// adaptador injeta o real; os testes, um falso). Streama tokens da resposta,
// executa tools de leitura e PAUSA numa tool de escrita, emitindo a proposta.
import { buildRegistry } from './tools/registry.js'
import { createProposal } from './proposals.js'
import { auditAgentRead, logUsage } from './audit.js'
import * as usageRepo from './usageRepo.js'
import { LIMITS, withTimeout } from './guards.js'

function parseArgs(raw) {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

// Teto de tamanho do resultado de tool que entra no histórico. MAX_TURNS conta
// BLOCOS, nunca tamanho: sem isto, 200 linhas de consultar_dados ficam na sessão
// e são reenviadas a cada turno por dez turnos — custo imprevisível e risco de
// estourar a janela de contexto.
//
// O corte deixa o JSON inválido DE PROPÓSITO. O destinatário é um modelo de
// linguagem, não um parser: o marcador em português diz o que sumiu e o que
// fazer a respeito. Não "conserte" isto fechando o JSON — fechar esconderia o
// corte e o modelo trataria a fatia como resposta completa.
export function truncarResultado(json, limite = Number(process.env.AGENT_MAX_TOOL_RESULT_CHARS) || 20_000) {
  if (json.length <= limite) return json
  return `${json.slice(0, limite)}\n[…resultado cortado: ${json.length} caracteres no total, ${limite} entregues. Diga isso a quem perguntou e ofereça refinar o período ou os filtros para ver o resto.]`
}

// Fallbacks legíveis para os dois becos sem-saída do turno. Ambos deixam o
// histórico limpo (sem push de assistant vazio) — reenviar vazio faria o provedor
// recusar a conversa inteira com 400. `now` é injetável para o teste do orçamento.
const FALLBACK_VAZIO = 'Não consegui gerar uma resposta agora. Pode reformular a pergunta ou tentar de novo?'
const FALLBACK_ORCAMENTO = 'Isso está levando mais tempo do que o esperado. Tenta de novo ou refina a pergunta (por exemplo, um período específico).'
// Teto de iterações estourado = o agente tentou e não convergiu. NÃO é erro cru
// pro usuário ("limite de iterações do agente atingido" é jargão interno): vira
// um convite a reformular, com histórico limpo e bem-formado (sem 400 no próximo
// turno). O esclarecimento sob medida ("você quis dizer X?") é papel do modelo,
// nas iterações que ele TEM (ver REGRAS no prompt); isto aqui é só a rede quando
// ele esgota as voltas sem fechar.
const FALLBACK_SEM_RESPOSTA = 'Não consegui chegar a uma resposta pra isso. Pode reformular com outras palavras — por exemplo, dizendo o período, o projeto ou a pessoa que você tem em mente?'

export async function runAgentTurn({ client, profile, model, messages, emit, conversationId = null, signal, now = Date.now }) {
  const registry = buildRegistry(profile)
  const usageTotal = { tokensIn: 0, tokensOut: 0, cached: 0 }
  const inicio = now()

  for (let i = 0; i < LIMITS.maxIterations; i++) {
    // §2 desconexão: se o cliente sumiu (req.on('close')), para ANTES de gastar
    // outra chamada ao modelo — e nada é emitido para um socket já morto.
    if (signal?.aborted) return { status: 'aborted', messages, usage: usageTotal }

    // §orçamento: estoura o relógio do turno inteiro antes de gastar mais uma
    // chamada ao modelo. Responde o fallback e sai — histórico limpo, sem 400.
    if (now() - inicio > LIMITS.turnBudgetMs) {
      emit({ type: 'answer', text: FALLBACK_ORCAMENTO })
      return { status: 'done', messages, usage: usageTotal }
    }

    let message, usage
    try {
      ;({ message, usage } = await withTimeout(
        // O raciocínio que o modelo escreve junto das tool calls NÃO vai pro
        // cliente. Streamamos para dentro (o cliente acumula em message.content),
        // mas só a resposta final — a iteração SEM tool_calls — é emitida, como um
        // evento 'answer' inteiro (mais abaixo). Com este modelo é impossível saber,
        // no meio do stream, se o texto que chega é raciocínio ou resposta (o sinal
        // tool_calls só aparece no fim da iteração); por isso a resposta não sai
        // token-a-token e o indicador "Pensando…" cobre toda a espera.
        client.stream({ messages, tools: registry.definitions, model }, () => {}),
        LIMITS.timeoutMs,
      ))
    } catch (err) {
      // §18/§19.1: custo e tentativa precisam aparecer no log inclusive quando a
      // chamada estoura timeout ou erra — não só no caminho feliz. Registra o
      // evento de falha e repropaga (a rota emite o erro ao cliente).
      const status = /timeout/i.test(err?.message || '') ? 'timeout' : 'error'
      logUsage({ profile, model, status, erro: err?.message })
      await usageRepo.insert({ profile, model, status })
      throw err
    }
    const cached = usage?.prompt_tokens_details?.cached_tokens || 0
    usageTotal.tokensIn += usage?.prompt_tokens || 0
    usageTotal.tokensOut += usage?.completion_tokens || 0
    usageTotal.cached += cached
    logUsage({ profile, model, tokensIn: usage?.prompt_tokens || 0, tokensOut: usage?.completion_tokens || 0, cached })
    await usageRepo.insert({ profile, model, tokensIn: usage?.prompt_tokens || 0, tokensOut: usage?.completion_tokens || 0, cached })

    const calls = message.tool_calls || []
    if (calls.length === 0) {
      // Iteração sem tool_calls = resposta final. Só agora o conteúdo é a
      // resposta ao usuário (não raciocínio), então emite-o de uma vez.
      //
      // Guarda contra resposta DEGENERADA: a DeepSeek às vezes devolve um turno
      // vazio (sem content E sem tool_calls — ex.: cortou no meio do raciocínio).
      // Um assistant assim NÃO pode entrar no histórico: reenviá-lo no turno
      // seguinte faz o provedor recusar a conversa INTEIRA com 400 "content or
      // tool_calls must be set", travando tudo até a sessão expirar. Então
      // responde com um fallback legível e deixa o histórico limpo (sem push).
      const conteudo = message.content || ''
      if (!conteudo) {
        emit({ type: 'answer', text: FALLBACK_VAZIO })
        return { status: 'done', messages, usage: usageTotal }
      }
      messages.push(message)
      emit({ type: 'answer', text: conteudo })
      return { status: 'done', messages, usage: usageTotal }
    }
    messages.push(message)

    for (const call of calls) {
      const tool = registry.get(call.function.name)
      const args = parseArgs(call.function.arguments)
      if (!tool) {
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'ferramenta indisponível' }) })
        continue
      }
      if (tool.kind === 'write') {
        try {
          const { descricao, dados, kind, payload } = await tool.propose(profile, args)
          // Guarda a sessão dona e a descrição na proposta: o execute vai
          // realimentar a sessão com o resultado depois de rodar de fato (§1).
          const { proposalId } = createProposal({ profile, kind, payload, conversationId, descricao })
          emit({ type: 'proposal', proposalId, descricao, dados })
          // Fecha o histórico ANTES de pausar: todo tool_call do assistant precisa
          // de uma resposta role:'tool', senão o próximo turno reenvia ao provedor
          // um histórico malformado (400). A resposta sinaliza PROPOSTA, nunca
          // "feito" (§10). Os demais calls da mesma mensagem também são fechados.
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ status: 'proposta_emitida', descricao }) })
          for (const pendente of calls) {
            if (messages.some((m) => m.role === 'tool' && m.tool_call_id === pendente.id)) continue
            messages.push({ role: 'tool', tool_call_id: pendente.id, content: JSON.stringify({ status: 'nao_executado', motivo: 'aguardando confirmação da proposta anterior' }) })
          }
          return { status: 'awaiting_confirmation', messages, usage: usageTotal }
        } catch (err) {
          // Ex.: "nenhum apontamento aberto" — devolve ao modelo como erro de tool.
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      } else if (tool.kind === 'meta') {
        // Captura interna (ex.: registrar_pedido_nao_atendido): roda inline como
        // leitura, mas não é agent_read nem pausa pra proposta.
        try {
          const result = await tool.run(profile, args)
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
        } catch (err) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      } else {
        try {
          const result = await tool.run(profile, args)
          if (result.arquivo) {
            const { token, filename, mime, bytes } = result.arquivo
            emit({ type: 'file', token, filename, mime, bytes })
          }
          auditAgentRead({ profile, tool: call.function.name, params: args, count: result.count })
          messages.push({ role: 'tool', tool_call_id: call.id, content: truncarResultado(JSON.stringify(result.data)) })
        } catch (err) {
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: err.message }) })
        }
      }
    }
  }
  // Esgotou as voltas sem uma resposta final: degrada para um convite a
  // reformular em vez de lançar erro cru. Histórico já está bem-formado (cada
  // volta fechou seus tool_calls), então é reenviável sem 400.
  emit({ type: 'answer', text: FALLBACK_SEM_RESPOSTA })
  return { status: 'done', messages, usage: usageTotal }
}
