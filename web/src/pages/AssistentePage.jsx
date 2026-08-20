import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Send, Square, RotateCcw, AlertCircle, Info, Plus, Sparkles, Loader2, Paperclip, X, Pencil, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useAgent } from '../contexts/AgentContext'
import { ListaConversas } from '../components/assistente/ListaConversas'
import { arquivosDaMensagem } from '../lib/agentFiles'
import { hrefPermitido } from '../lib/agentLinks'
import { aberturaDoPapel } from '../lib/agentOpening'
import { BolhaMarkdown } from '../components/assistente/BolhaMarkdown'
import { RodapeBolha } from '../components/assistente/RodapeBolha'
import { podeRefazer, podeEditar } from '../lib/agentAcoes'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// ── Página do Assistente (tela cheia) ──────────────────────────────────────
// Lista à esquerda (md+); mobile abre o mesmo conteúdo full-height. Sem
// sidebar no Layout. Transcript no servidor; localStorage v2 só guarda o id.

// Anexos que o bot sabe ler (texto puro). Imagem/escaneado fica de fora — é visão.
const TIPOS_ACEITOS = [
  '.pdf', '.txt', '.md', '.docx',
  'application/pdf', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

// ── Preview estruturado da proposta ───────────────────────────────────────
// O backend manda `dados` cru (inclui uuids internos). Traduzimos as chaves
// úteis, escondemos os *_id e formatamos datas — o usuário confirma o efeito,
// não o payload.
const ROTULOS = {
  projeto: 'Projeto',
  titulo: 'Título',
  prioridade: 'Prioridade',
  started_at: 'Início',
  start_date: 'De',
  end_date: 'Até',
  reason: 'Motivo',
  motivo: 'Motivo',
  days_count: 'Dias',
  valor: 'Valor',
  data: 'Data',
  comprovante: 'Comprovante',
  de: 'De',
  para: 'Para',
  texto: 'Texto',
  responsável: 'Responsável',
  prazo: 'Prazo',
}
const PRIORIDADES = {
  low: 'Baixa', medium: 'Média', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
  baixa: 'Baixa', media: 'Média', alta: 'Alta',
}
const STATUS_BOARD = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Falta info',
  in_review: 'Em revisão',
  done: 'Feito',
  abandoned: 'Abandonado',
}

function prettify(chave) {
  return chave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function formatarValor(chave, valor) {
  if (valor == null || valor === '') return '—'
  if (chave === 'valor' && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (chave === 'prioridade') return PRIORIDADES[String(valor).toLowerCase()] ?? String(valor)
  if (chave === 'de' || chave === 'para') return STATUS_BOARD[valor] ?? String(valor)
  if (typeof valor === 'string') {
    // Data pura (YYYY-MM-DD): monta local para não escorregar um dia no fuso.
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const [a, m, d] = valor.split('-').map(Number)
      return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
    // Datetime ISO: mostra data + hora no fuso local.
    if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) {
      const dt = new Date(valor)
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      }
    }
  }
  return String(valor)
}

function linhasDados(dados) {
  if (!dados || typeof dados !== 'object') return []
  return Object.entries(dados)
    .filter(([k, v]) => !k.endsWith('_id') && v != null && v !== '')
    .map(([k, v]) => ({ chave: k, rotulo: ROTULOS[k] ?? prettify(k), valor: formatarValor(k, v) }))
}

// Saudação conforme a hora; sem nome, cai no "Oi." lá embaixo.
function saudacaoHora() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Pequeno ícone do assistente — reaproveitado no topo, no vazio e nas respostas.
function MarcaAssistente({ box = 28, icon = 14 }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-md border border-border-subtle text-accent"
      style={{ width: box, height: box }}
    >
      <Sparkles size={icon} />
    </span>
  )
}

// Indicador de "pensamento": ícone girando + rótulo, enquanto o agente roda
// tools ou ainda não emitiu o primeiro token. Some quando a bolha começa a
// crescer; token_revoke traz de volta.
function Pensando() {
  return (
    <div className="flex items-center gap-2 py-1 text-text-secondary" role="status" aria-label="Assistente está pensando">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      <span className="text-sm">Pensando…</span>
    </div>
  )
}

// O carimbo tem três formas: projeto, tarefa e PESSOA (PessoasPage). Sem o ramo
// de pessoa o chip nasceria vazio e apontando para /projetos — um link mudo
// para a tela errada.
function textoDoChip(ctx) {
  const nome = ctx?.projectName || ''
  if (ctx?.taskTitle) return nome ? `${nome} · ${ctx.taskTitle}` : ctx.taskTitle
  if (ctx?.taskCount != null && ctx.taskCount !== '') {
    const n = Number(ctx.taskCount)
    if (Number.isFinite(n)) {
      return `${nome} · ${n} ${n === 1 ? 'tarefa' : 'tarefas'}`
    }
  }
  if (nome) return nome
  return ctx?.personName || ''
}

function hrefDoChip(ctx) {
  if (ctx?.taskId) return `/tarefas?task=${ctx.taskId}`
  if (ctx?.projectId) return `/projetos?project=${ctx.projectId}`
  // /pessoas não lê parâmetro de seleção hoje; o chip leva para a tela, não
  // para a ficha — melhor que mandar para /projetos.
  if (ctx?.personId) return '/pessoas'
  return '/projetos'
}

function ChipsLinks({ links }) {
  const visiveis = (links || []).filter((l) => l?.href && hrefPermitido(l.href))
  if (!visiveis.length) return null
  const chip = 'inline-flex items-center border border-border-subtle bg-surface px-2.5 py-1 text-xs text-text-primary transition-colors hover:bg-surface-alt'
  return (
    <div className="flex flex-wrap gap-2">
      {visiveis.map((l) => (
        l.href.startsWith('/') ? (
          <Link key={l.href} to={l.href} className={chip}>{l.label}</Link>
        ) : (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={chip}>{l.label}</a>
        )
      ))}
    </div>
  )
}

export function AssistentePage() {
  useDocumentTitle('Assistente')
  const { profile } = useAuth()
  // O estado da conversa vive no AgentContext (acima do router), para o painel
  // lateral e esta página serem duas VIEWS da mesma conversa.
  const {
    mensagens, conversa, ocupado, arquivo, anexoErro, sugestoes, contextoAtivo, itens,
    setArquivo, setAnexoErro,
    enviar, interromper, tentarStream, refazer, aprovar, baixar, cancelar, escolherArquivo,
    novaConversa: novaConversaCtx, selecionarConversa: selecionarConversaCtx,
    renomearConversa, apagarConversa, dispensarContextoAtivo, relerContexto, registrarScroll,
  } = useAgent()
  const [input, setInput] = useState('')
  const [painelAberto, setPainelAberto] = useState(false)
  const abertura = aberturaDoPapel(profile?.role, contextoAtivo)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const listaRef = useRef(null)
  const pertoDoFundoRef = useRef(true)

  const estaVazio = mensagens.length === 0
  const primeiroNome = (profile?.name || '').trim().split(' ')[0]

  // Foco no campo ao montar e a cada troca entre vazio ↔ conversa.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [estaVazio])

  function atualizarPertoDoFundo() {
    const el = listaRef.current
    if (!el) return
    pertoDoFundoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function rolarParaFim() {
    const el = listaRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    pertoDoFundoRef.current = true
  }

  function ajustarAltura() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // Enquanto a página estiver montada, é a lista DELA que o contexto rola.
  // O cleanup vem do próprio registrarScroll: só solta se ainda for o dela.
  useEffect(() => registrarScroll({
    pertoDoFundo: () => pertoDoFundoRef.current,
    rolarParaFim,
  }), [registrarScroll])

  // Relê o carimbo a CADA montagem da página, não uma vez por carga do app: o
  // usuário carimba "Casa Verde" em /projetos e só depois vem para cá, com o
  // provider já montado há tempo. Sem isto o chip nunca aparece e a pergunta
  // sobe com context: null — o modelo não sabe de que projeto se fala.
  useEffect(() => { relerContexto() }, [relerContexto])

  // O contexto cuida da conversa; o input e o textarea são desta tela.
  async function enviarDaPagina(textoArg) {
    const texto = (typeof textoArg === 'string' ? textoArg : input).trim()
    if ((!texto && !arquivo) || ocupado) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await enviar(texto)
  }

  function novaConversa() {
    novaConversaCtx()
    setInput('')
    setPainelAberto(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }

  // O drawer do mobile só fecha se a conversa entrou mesmo. Fechar sempre
  // esconde a lista sem trocar nada quando o pedido é recusado (stream rodando)
  // ou quando o GET falha — o usuário fica olhando a conversa antiga sem pista
  // do que aconteceu.
  async function selecionarConversa(id) {
    const trocou = await selecionarConversaCtx(id)
    if (trocou) setPainelAberto(false)
  }

  // Devolve a pergunta ao composer para ajustar e mandar de novo.
  //
  // NÃO remove o par do transcript de propósito: o histórico do servidor é a
  // fonte da verdade e não tem delete de mensagem, então some da tela mas
  // voltaria no próximo reload — e, pior, o modelo continuaria enxergando o que
  // a tela diz que não existe. Aqui a pergunta antiga fica visível e a nova
  // entra embaixo; nada é prometido que não se cumpra.
  function editarPergunta(idx) {
    const msg = mensagens[idx]
    if (!msg || ocupado) return
    setInput(msg.texto || '')
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      ajustarAltura()
    })
  }

  // Composer compartilhado: centralizado no vazio, fixo no rodapé na conversa.
  function renderComposer() {
    return (
      <div className="space-y-2">
        {/* Chip do contexto ativo + anexo pendente (ou erro) acima da digitação */}
        {(contextoAtivo || arquivo || anexoErro) && (
          <div className="flex flex-wrap items-center gap-2">
            {contextoAtivo && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-subtle bg-surface-alt px-2.5 py-1.5 text-xs text-text-primary">
                <Link
                  to={hrefDoChip(contextoAtivo)}
                  className="max-w-[16rem] truncate hover:underline"
                >
                  {textoDoChip(contextoAtivo)}
                </Link>
                <button
                  type="button"
                  onClick={dispensarContextoAtivo}
                  aria-label="Esquecer este contexto"
                  className="flex-none text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {arquivo && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-subtle bg-surface-alt px-2.5 py-1.5 text-xs text-text-primary">
                <Paperclip size={12} className="flex-none text-accent" />
                <span className="max-w-[16rem] truncate">{arquivo.name}</span>
                <button
                  type="button"
                  onClick={() => setArquivo(null)}
                  aria-label="Remover anexo"
                  className="flex-none text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            {anexoErro && <span className="state-danger text-xs">{anexoErro}</span>}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={TIPOS_ACEITOS}
            onChange={escolherArquivo}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={ocupado}
            aria-label="Anexar arquivo"
            title="Anexar PDF, Word (.docx) ou texto (.txt/.md)"
            className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors hover:bg-surface-alt hover:text-text-primary disabled:opacity-40"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); ajustarAltura() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviarDaPagina()
              }
            }}
            rows={1}
            placeholder="Pergunte, peça uma ação ou anexe um documento…"
            aria-label="Mensagem para o Assistente"
            className="form-control max-h-[200px] flex-1 resize-none rounded-md border px-3 py-2.5 text-sm outline-none"
          />
          {ocupado ? (
            <button
              type="button"
              onClick={interromper}
              aria-label="Parar"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent text-white transition-opacity hover:opacity-90"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => enviarDaPagina()}
              disabled={!input.trim() && !arquivo}
              aria-label="Enviar"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderLista() {
    return (
      <ListaConversas
        items={itens}
        ativaId={conversa}
        onSelect={selecionarConversa}
        onRename={renomearConversa}
        onDelete={apagarConversa}
        disabled={ocupado}
      />
    )
  }

  return (
    // Neutraliza o padding do <main> para colar o chat na viewport (Topbar = h-14).
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] bg-surface md:-mx-8 md:-my-8">
      <aside className="hidden w-72 flex-none flex-col border-r border-border-subtle md:flex">
        {renderLista()}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Topo fino — a marca já vive na Topbar, então aqui é só um rótulo discreto. */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-border-subtle px-4 md:px-6">
        <button
          type="button"
          onClick={() => setPainelAberto(true)}
          className="inline-flex items-center rounded-md border border-border-subtle px-3 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-surface-alt md:hidden"
        >
          Conversas
        </button>
        <MarcaAssistente box={24} icon={13} />
        <span className="text-sm font-medium tracking-wide text-text-primary">Assistente</span>
        <button
          type="button"
          onClick={novaConversa}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-surface-alt"
        >
          <Plus size={14} /> Nova conversa
        </button>
      </header>

      {estaVazio ? (
        // ── Estado vazio: saudação calma + chips + composer, tudo centralizado ──
        <div className="flex flex-1 min-h-0 items-center justify-center overflow-y-auto">
          <div className="w-full max-w-[42rem] px-6 py-10 text-center">
            <span className="mx-auto mb-6 flex h-11 w-11 items-center justify-center rounded-md border border-border-subtle text-accent">
              <Sparkles size={20} />
            </span>
            <h2 className="font-serif text-[2.25rem] leading-[1.1] text-text-primary md:text-[2.75rem]">
              {primeiroNome ? (
                <>{saudacaoHora()}, <span className="font-serif-em">{primeiroNome}</span>.</>
              ) : (
                'Oi.'
              )}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-text-secondary">
              {abertura.subtitulo}
            </p>

            <div className="mt-8 text-left">{renderComposer()}</div>

            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {abertura.chips.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviarDaPagina(s)}
                  disabled={ocupado}
                  className="rounded-full border border-border-subtle bg-surface px-4 py-2 text-[13px] text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        // ── Conversa ativa: lista rola, composer gruda no rodapé ──
        <>
          <div
            ref={listaRef}
            onScroll={atualizarPertoDoFundo}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto w-full max-w-[46rem] space-y-6 px-4 py-8 text-sm md:px-6">
              {mensagens.map((m, i) => {
                if (m.autor === 'user') {
                  return (
                    <div key={i} className="group/user flex items-start justify-end gap-2">
                      {podeEditar(mensagens, i) && !ocupado && (
                        <button
                          type="button"
                          onClick={() => editarPergunta(i)}
                          aria-label="Editar esta pergunta"
                          className="mt-2 inline-flex flex-none text-text-secondary transition-opacity hover:text-text-primary md:opacity-0 md:focus-visible:opacity-100 md:group-hover/user:opacity-100"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <div className="max-w-[80%] rounded-md border border-border-subtle bg-surface-alt px-4 py-2.5 text-text-primary">
                        {m.anexo && (
                          <div className={`flex items-center gap-1.5 text-xs text-text-secondary ${m.texto ? 'mb-1.5' : ''}`}>
                            <Paperclip size={12} className="flex-none text-accent" />
                            <span className="truncate">{m.anexo}</span>
                          </div>
                        )}
                        {m.texto && (
                          <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                        )}
                      </div>
                    </div>
                  )
                }

                const streaming = ocupado && i === mensagens.length - 1 && !m.proposta && !m.erro
                const digitando = streaming && !m.texto
                const linhas = m.proposta ? linhasDados(m.proposta.dados) : []
                const arquivos = arquivosDaMensagem(m)

                return (
                  <div key={i} className="flex gap-3">
                    <MarcaAssistente box={28} icon={14} />
                    <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                      {digitando ? (
                        <Pensando />
                      ) : m.texto ? (
                        <div className="space-y-2">
                          {/* group/bolha: as ações do rodapé reagem ao cursor em
                              QUALQUER lugar da resposta, não só na faixa fina. */}
                          <div className="group/bolha relative">
                            <BolhaMarkdown texto={m.texto} cursor={streaming} />
                            {!streaming && (
                              <RodapeBolha
                                texto={m.texto}
                                fontes={m.fontes}
                                messageId={m.id}
                                onRefazer={podeRefazer(mensagens, i) && !ocupado ? () => refazer(i) : undefined}
                              />
                            )}
                          </div>
                          {!streaming && <ChipsLinks links={m.links} />}
                        </div>
                      ) : null}

                      {/* Arquivos gerados — um botão por arquivo (TTL 5 min no servidor) */}
                      {arquivos.length > 0 && (
                        <div className="space-y-2">
                          {arquivos.map((arq) => (
                            <button
                              key={arq.token}
                              type="button"
                              onClick={() => baixar(i, arq.token)}
                              className="block rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt"
                            >
                              Baixar {arq.filename}
                            </button>
                          ))}
                          {m.arquivoErro && (
                            <p className="state-danger-soft max-w-[33rem] px-2.5 py-1.5 text-xs">{m.arquivoErro}</p>
                          )}
                        </div>
                      )}

                      {/* Resume: proposta sem desfecho volta expirada — sem Aprovar.
                          O !aprovado/!cancelado é cinto e suspensório: o servidor
                          já não marca expirado quando houve desfecho, mas os dois
                          cards juntos era exatamente o bug ("EXPIRADA" + "Executado"). */}
                      {m.proposta?.expirado && !m.aprovado && !m.cancelado && (
                        <div className="max-w-[33rem] rounded-md border border-border-subtle bg-surface px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Proposta expirada</p>
                          <p className="mt-0.5 text-text-secondary">{m.proposta.descricao}</p>
                        </div>
                      )}

                      {/* Proposta pendente — requer confirmação */}
                      {m.proposta && !m.proposta.expirado && !m.aprovado && !m.cancelado && (
                        <div className="max-w-[33rem] overflow-hidden rounded-md border border-border-subtle bg-surface">
                          <div aria-hidden style={{ height: '2px', background: 'var(--color-orange)' }} />
                          <div className="p-4">
                            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-secondary">
                              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-orange)' }} />
                              Requer confirmação
                            </p>
                            <p className="mt-2 text-text-primary">{m.proposta.descricao}</p>

                            {/* Fato verificável, não acusação: havia arquivo de
                                terceiro no contexto quando esta escrita foi
                                proposta. Quem confirma decide sabendo disso. */}
                            {m.proposta.comAnexo && (
                              <p className="mt-2 flex items-start gap-1.5 text-xs text-text-secondary">
                                <Info size={13} className="mt-0.5 flex-none text-orange" aria-hidden />
                                <span>Proposta a partir de um arquivo que você enviou. Confira se é o que você pediu.</span>
                              </p>
                            )}

                            {linhas.length > 0 && (
                              <dl className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                                {linhas.map((l) => (
                                  <div key={l.chave} className="flex items-baseline justify-between gap-4 py-2">
                                    <dt className="text-[10px] uppercase tracking-wider text-text-secondary">{l.rotulo}</dt>
                                    <dd className="text-right tabular-nums text-text-primary">{l.valor}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}

                            {m.erro && (
                              <p className="state-danger-soft mt-3 px-2.5 py-1.5 text-xs">{m.erro}</p>
                            )}

                            <div className="mt-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => aprovar(i)}
                                disabled={m.executando}
                                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                              >
                                {m.executando ? 'Aprovando…' : 'Aprovar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelar(i)}
                                disabled={m.executando}
                                className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                              {m.erro && (
                                <button
                                  type="button"
                                  onClick={() => aprovar(i)}
                                  className="state-danger ml-auto inline-flex items-center gap-1 text-xs hover:underline"
                                >
                                  <RotateCcw size={12} /> Tentar de novo
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Proposta aprovada — mantém o registro do que foi feito */}
                      {m.proposta && m.aprovado && (
                        <div className="flex max-w-[33rem] items-start gap-2.5 rounded-md border border-border-subtle bg-surface px-3 py-2.5">
                          <Check size={16} className="state-success mt-0.5 flex-none" />
                          <div className="min-w-0">
                            <p className="state-success text-[10px] uppercase tracking-wider">Concluído</p>
                            <p className="mt-0.5 text-text-primary">{m.proposta.descricao}</p>
                          </div>
                        </div>
                      )}

                      {/* Proposta cancelada */}
                      {m.proposta && m.cancelado && (
                        <div className="max-w-[33rem] rounded-md border border-border-subtle bg-surface px-3 py-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-text-secondary">Cancelado</p>
                          <p className="mt-0.5 text-text-secondary">{m.proposta.descricao}</p>
                        </div>
                      )}

                      {/* Erro de resposta (sem proposta) */}
                      {m.aviso && (
                        <div className="max-w-[33rem] overflow-hidden rounded-md border border-border-subtle bg-surface">
                          <div aria-hidden style={{ height: '2px', background: 'var(--color-orange)' }} />
                          <div className="flex items-start gap-2.5 p-4">
                            <Info size={16} className="mt-0.5 flex-none text-orange" />
                            <p className="min-w-0 text-text-primary">{m.aviso}</p>
                          </div>
                        </div>
                      )}

                      {m.erro && !m.proposta && (
                        <div className="max-w-[33rem] overflow-hidden rounded-md border border-border-subtle bg-surface">
                          <div aria-hidden style={{ height: '2px', background: 'var(--state-danger)' }} />
                          <div className="flex items-start gap-2.5 p-4">
                            <AlertCircle size={16} className="state-danger mt-0.5 flex-none" />
                            <div className="min-w-0">
                              <p className="text-text-primary">{m.erro}</p>
                              <button
                                type="button"
                                onClick={() => tentarStream(i)}
                                disabled={ocupado}
                                className="state-danger mt-1.5 inline-flex items-center gap-1 text-xs hover:underline disabled:opacity-50"
                              >
                                <RotateCcw size={12} /> Tentar de novo
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Composer fixo no rodapé */}
          <div className="flex-none border-t border-border-subtle bg-surface">
            <div className="mx-auto w-full max-w-[46rem] px-4 py-4 md:px-6">
              {sugestoes.length > 0 && !ocupado && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviarDaPagina(s)}
                      className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-surface-alt"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {renderComposer()}
            </div>
          </div>
        </>
      )}
      </div>

      {painelAberto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface md:hidden">
          <header className="flex h-14 flex-none items-center gap-3 border-b border-border-subtle px-4">
            <span className="text-sm font-medium text-text-primary">Conversas</span>
            <button
              type="button"
              onClick={() => setPainelAberto(false)}
              className="ml-auto inline-flex items-center rounded-md border border-border-subtle px-3 py-1.5 text-[13px] text-text-primary transition-colors hover:bg-surface-alt"
            >
              Fechar
            </button>
          </header>
          {renderLista()}
        </div>
      )}
    </div>
  )
}
