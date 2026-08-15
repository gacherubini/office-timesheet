import { useState, useRef, useEffect } from 'react'
import { Send, RotateCcw, AlertCircle, Check, Plus, Sparkles, Loader2, Paperclip, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { streamChat, executeProposal, cancelProposal, downloadAgentFile } from '../lib/agentClient'
import { lerSessao, salvarSessao, limparSessao } from '../lib/agentSession'

// ── Página do Assistente (tela cheia) ──────────────────────────────────────
// Aposenta o widget flutuante: coluna central única, sem sidebar/histórico, a
// conversa vive só na sessão atual. A lógica de streaming e do fluxo de
// proposta (aprovar/cancelar) é a mesma que rodava no widget.
const SUGESTOES = [
  'Quantas horas lancei este mês?',
  'Quais projetos estão ativos?',
  'Quero pedir férias',
]

// Anexos que o bot sabe ler (texto puro). Imagem/escaneado fica de fora — é visão.
const TIPOS_ACEITOS = [
  '.pdf', '.txt', '.md', '.docx',
  'application/pdf', 'text/plain', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')
const MAX_ANEXO_BYTES = 10 * 1024 * 1024 // espelha o teto do servidor

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
}
const PRIORIDADES = {
  low: 'Baixa', medium: 'Média', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
  baixa: 'Baixa', media: 'Média', alta: 'Alta',
}

function prettify(chave) {
  return chave.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function formatarValor(chave, valor) {
  if (valor == null || valor === '') return '—'
  if (chave === 'prioridade') return PRIORIDADES[String(valor).toLowerCase()] ?? String(valor)
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

// Indicador de "pensamento": ícone girando + rótulo, enquanto o agente roda as
// consultas internas. O raciocínio do modelo não aparece — só este indicador,
// até a resposta final chegar (evento 'answer') e substituí-lo.
function Pensando() {
  return (
    <div className="flex items-center gap-2 py-1 text-text-secondary" role="status" aria-label="Assistente está pensando">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      <span className="text-sm">Pensando…</span>
    </div>
  )
}

export function AssistentePage() {
  const { profile } = useAuth()
  const [mensagens, setMensagens] = useState([]) // { autor, texto, proposta?, aprovado?, cancelado?, erro?, executando? }
  const [input, setInput] = useState('')
  const [conversa, setConversa] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [arquivo, setArquivo] = useState(null) // File anexado, ainda não enviado
  const [anexoErro, setAnexoErro] = useState(null)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const fimRef = useRef(null)
  const restauradoRef = useRef(false)

  const estaVazio = mensagens.length === 0
  const primeiroNome = (profile?.name || '').trim().split(' ')[0]

  // Restaura a conversa salva (localStorage, 30 min, por usuário) assim que o
  // profile existe — uma vez só. Sem isto, navegar na navbar desmonta a página e
  // zera o useState, perdendo a conversa mesmo com a sessão do servidor viva.
  useEffect(() => {
    if (restauradoRef.current || !profile?.id) return
    const salvo = lerSessao(profile.id)
    if (salvo) {
      setMensagens(salvo.mensagens)
      setConversa(salvo.conversationId)
    }
    restauradoRef.current = true
  }, [profile?.id])

  // Persiste a cada mudança — mas só DEPOIS de restaurar, para o render inicial
  // (vazio) não sobrescrever o que já estava salvo.
  useEffect(() => {
    if (!restauradoRef.current || !profile?.id) return
    salvarSessao(profile.id, { conversationId: conversa, mensagens })
  }, [mensagens, conversa, profile?.id])

  // Foco no campo ao montar e a cada troca entre vazio ↔ conversa.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [estaVazio])

  // Rola para o fim a cada token / mensagem nova.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens])

  function ajustarAltura() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // Handler dos eventos SSE, mirando um índice de bolha específico.
  function receber(idxBot) {
    return (e) => {
      if (e.type === 'session') setConversa(e.conversation_id)
      // Só a resposta final chega (o raciocínio fica escondido atrás do "Pensando…").
      // Vem inteira num único evento, então define o texto de uma vez.
      if (e.type === 'answer') {
        setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: e.text } : msg)))
      }
      if (e.type === 'proposal') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot ? { ...msg, proposta: { proposalId: e.proposalId, descricao: e.descricao, dados: e.dados } } : msg
        )))
      }
      if (e.type === 'file') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot ? { ...msg, arquivo: { token: e.token, filename: e.filename, mime: e.mime, bytes: e.bytes } } : msg
        )))
      }
      if (e.type === 'error') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot ? { ...msg, erro: e.error || 'Não consegui responder agora.' } : msg
        )))
      }
    }
  }

  async function correr(idxBot, texto, file) {
    setOcupado(true)
    try {
      await streamChat({ message: texto, conversationId: conversa, file, onEvent: receber(idxBot) })
    } catch (err) {
      setMensagens((m) => m.map((msg, i) => (
        i === idxBot ? { ...msg, erro: err.message || 'Não consegui responder agora.' } : msg
      )))
    } finally {
      setOcupado(false)
    }
  }

  // Valida tamanho/vazio no cliente pra falhar rápido; o tipo quem confere de
  // verdade é o servidor (extração). Zera o input pra permitir reescolher o mesmo.
  function escolherArquivo(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_ANEXO_BYTES) {
      setAnexoErro('Arquivo grande demais (máx. 10 MB).')
      setArquivo(null)
      return
    }
    setAnexoErro(null)
    setArquivo(f)
  }

  async function enviar(textoArg) {
    const texto = (typeof textoArg === 'string' ? textoArg : input).trim()
    if ((!texto && !arquivo) || ocupado) return
    const fileToSend = arquivo // capturado ANTES de limpar o estado
    setInput('')
    setArquivo(null)
    setAnexoErro(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const idxBot = mensagens.length + 1
    setMensagens((m) => [
      ...m,
      { autor: 'user', texto, anexo: fileToSend?.name || null, arquivoObj: fileToSend || null },
      { autor: 'bot', texto: '' },
    ])
    await correr(idxBot, texto, fileToSend)
  }

  // Reenvia a pergunta na mesma bolha (erro de resposta). O anexo vai junto: um
  // turno que falhou não foi salvo no servidor, então sem o arquivo o modelo
  // nunca veria o documento — e a bolha continuaria mostrando o clipe, mentindo.
  // Depois de um reload o File se perdeu (não atravessa o localStorage) e o
  // retry manda só o texto; é o melhor possível sem reanexar.
  async function tentarStream(idxBot) {
    const userMsg = mensagens[idxBot - 1]
    if (!userMsg || userMsg.autor !== 'user' || ocupado) return
    setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: '', erro: null } : msg)))
    await correr(idxBot, userMsg.texto, userMsg.arquivoObj || undefined)
  }

  async function aprovar(idx) {
    const msg = mensagens[idx]
    if (!msg?.proposta || msg.executando) return
    setMensagens((m) => m.map((x, i) => (i === idx ? { ...x, erro: null, executando: true } : x)))
    try {
      await executeProposal(msg.proposta.proposalId)
      setMensagens((m) => m.map((x, i) => (i === idx ? { ...x, aprovado: true, executando: false } : x)))
    } catch (err) {
      setMensagens((m) => m.map((x, i) => (
        i === idx ? { ...x, erro: err.message || 'Não consegui concluir a ação.', executando: false } : x
      )))
    }
  }

  async function baixar(idx) {
    const msg = mensagens[idx]
    if (!msg?.arquivo?.token) return
    try {
      await downloadAgentFile(msg.arquivo.token)
      setMensagens((m) => m.map((x, i) => (i === idx ? { ...x, arquivoErro: null } : x)))
    } catch (err) {
      const expirado = /expirado/i.test(err.message || '')
      setMensagens((m) => m.map((x, i) => (
        i === idx
          ? { ...x, arquivoErro: expirado ? 'esse arquivo expirou, pede de novo' : (err.message || 'Não consegui baixar o arquivo.') }
          : x
      )))
    }
  }

  async function cancelar(idx) {
    const msg = mensagens[idx]
    if (!msg?.proposta || msg.executando) return
    // Marca na UI PRIMEIRO: cancelar não pode ficar preso esperando rede. Se a
    // chamada falhar, o TTL de 5 min derruba a proposta de qualquer forma — o
    // que se perde é só a nota no histórico do modelo.
    setMensagens((m) => m.map((x, i) => (i === idx ? { ...x, cancelado: true } : x)))
    try {
      await cancelProposal(msg.proposta.proposalId)
    } catch {
      /* proposta expira sozinha; não vale incomodar quem já cancelou */
    }
  }

  function novaConversa() {
    limparSessao()
    setMensagens([])
    setConversa(null)
    setInput('')
    setArquivo(null)
    setAnexoErro(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }

  // Composer compartilhado: centralizado no vazio, fixo no rodapé na conversa.
  function renderComposer() {
    return (
      <div className="space-y-2">
        {/* Chip do anexo pendente (ou erro de anexo) acima da linha de digitação */}
        {(arquivo || anexoErro) && (
          <div className="flex flex-wrap items-center gap-2">
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
                enviar()
              }
            }}
            rows={1}
            placeholder="Pergunte, peça uma ação ou anexe um documento…"
            aria-label="Mensagem para o Assistente"
            className="form-control max-h-[200px] flex-1 resize-none rounded-md border px-3 py-2.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => enviar()}
            disabled={ocupado || (!input.trim() && !arquivo)}
            aria-label="Enviar"
            className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    // Neutraliza o padding do <main> para colar o chat na viewport (Topbar = h-14).
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.5rem)] flex-col bg-surface md:-mx-8 md:-my-8">
      {/* Topo fino — a marca já vive na Topbar, então aqui é só um rótulo discreto. */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-border-subtle px-4 md:px-6">
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
              Como posso ajudar? Toda alteração passa por você antes de valer.
            </p>

            <div className="mt-8 text-left">{renderComposer()}</div>

            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full border border-border-subtle bg-surface px-4 py-2 text-[13px] text-text-primary transition-colors hover:bg-surface-alt"
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
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto w-full max-w-[46rem] space-y-6 px-4 py-8 text-sm md:px-6">
              {mensagens.map((m, i) => {
                if (m.autor === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
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

                return (
                  <div key={i} className="flex gap-3">
                    <MarcaAssistente box={28} icon={14} />
                    <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                      {digitando ? (
                        <Pensando />
                      ) : m.texto ? (
                        <p className="max-w-[46ch] whitespace-pre-wrap break-words leading-relaxed text-text-primary">
                          {m.texto}
                        </p>
                      ) : null}

                      {/* Arquivo gerado — download efêmero (TTL 5 min no servidor) */}
                      {m.arquivo && (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => baixar(i)}
                            className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-alt"
                          >
                            Baixar {m.arquivo.filename}
                          </button>
                          {m.arquivoErro && (
                            <p className="state-danger-soft max-w-[33rem] px-2.5 py-1.5 text-xs">{m.arquivoErro}</p>
                          )}
                        </div>
                      )}

                      {/* Proposta pendente — requer confirmação */}
                      {m.proposta && !m.aprovado && !m.cancelado && (
                        <div className="max-w-[33rem] overflow-hidden rounded-md border border-border-subtle bg-surface">
                          <div aria-hidden style={{ height: '2px', background: 'var(--color-orange)' }} />
                          <div className="p-4">
                            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-secondary">
                              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-orange)' }} />
                              Requer confirmação
                            </p>
                            <p className="mt-2 text-text-primary">{m.proposta.descricao}</p>

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
              <div ref={fimRef} />
            </div>
          </div>

          {/* Composer fixo no rodapé */}
          <div className="flex-none border-t border-border-subtle bg-surface">
            <div className="mx-auto w-full max-w-[46rem] px-4 py-4 md:px-6">
              {renderComposer()}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
