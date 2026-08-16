import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Send, Square, RotateCcw, AlertCircle, Info, Plus, Sparkles, Loader2, Paperclip, X, Pencil } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { streamChat, executeProposal, cancelProposal, downloadAgentFile, listConversations, getConversation, renameConversation, deleteConversation } from '../lib/agentClient'
import { lerSessao, salvarSessao, limparSessao } from '../lib/agentSession'
import { ListaConversas } from '../components/assistente/ListaConversas'
import { arquivosDaMensagem, anexarArquivo } from '../lib/agentFiles'
import { hrefPermitido } from '../lib/agentLinks'
import { aberturaDoPapel } from '../lib/agentOpening'
import { lerContexto, dispensarContexto } from '../lib/agentContext'
import { BolhaMarkdown } from '../components/assistente/BolhaMarkdown'
import { criarPincel } from '../lib/agentPincel'
import { RodapeBolha } from '../components/assistente/RodapeBolha'
import { podeRefazer, podeEditar, limparParaRefazer } from '../lib/agentAcoes'

// ── Página do Assistente (tela cheia) ──────────────────────────────────────
// Lista à esquerda (md+); mobile abre o mesmo conteúdo full-height. Sem
// sidebar no Layout. Transcript no servidor; localStorage v2 só guarda o id.

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

function textoDoChip(ctx) {
  const nome = ctx?.projectName || ''
  if (ctx?.taskTitle) return nome ? `${nome} · ${ctx.taskTitle}` : ctx.taskTitle
  if (ctx?.taskCount != null && ctx.taskCount !== '') {
    const n = Number(ctx.taskCount)
    if (Number.isFinite(n)) {
      return `${nome} · ${n} ${n === 1 ? 'tarefa' : 'tarefas'}`
    }
  }
  return nome
}

function hrefDoChip(ctx) {
  if (ctx?.taskId) return `/tarefas?task=${ctx.taskId}`
  if (ctx?.projectId) return `/projetos?project=${ctx.projectId}`
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
  const { profile } = useAuth()
  const [mensagens, setMensagens] = useState([]) // { autor, texto, proposta?, aprovado?, cancelado?, erro?, executando? }
  const [input, setInput] = useState('')
  const [conversa, setConversa] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [arquivo, setArquivo] = useState(null) // File anexado, ainda não enviado
  const [anexoErro, setAnexoErro] = useState(null)
  const [sugestoes, setSugestoes] = useState([])
  const [contextoAtivo, setContextoAtivo] = useState(null)
  const [itens, setItens] = useState([])
  const [painelAberto, setPainelAberto] = useState(false)
  const abertura = aberturaDoPapel(profile?.role, contextoAtivo)

  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const listaRef = useRef(null)
  const abortRef = useRef(null)
  const pincelRef = useRef(null)
  const pertoDoFundoRef = useRef(true)
  const restauradoRef = useRef(false)
  const contextoLidoRef = useRef(false)

  useEffect(() => () => { pincelRef.current?.parar() }, [])

  const estaVazio = mensagens.length === 0
  const primeiroNome = (profile?.name || '').trim().split(' ')[0]

  async function recarregarLista() {
    try {
      const data = await listConversations()
      setItens(data?.items || [])
    } catch {
      setItens([])
    }
  }

  // Restaura só o id (v2). O transcript vem do GET — propostas já nascem
  // expiradas. Lista carrega junto. 404 some o id; 503 (kill switch) não.
  useEffect(() => {
    if (restauradoRef.current || !profile?.id) return
    restauradoRef.current = true
    recarregarLista()
    const salvo = lerSessao(profile.id)
    if (!salvo?.conversationId) return
    getConversation(salvo.conversationId)
      .then((c) => {
        setMensagens(c.messages || [])
        setConversa(c.id)
      })
      .catch((err) => {
        if (/não encontrad/i.test(err?.message || '')) limparSessao()
      })
  }, [profile?.id])

  // Chip de contexto: lê o carimbo da aba uma vez. Dismiss vive no
  // sessionStorage — remount de /assistente não ressuscita o chip.
  useEffect(() => {
    if (contextoLidoRef.current) return
    setContextoAtivo(lerContexto())
    contextoLidoRef.current = true
  }, [])

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

  // Handler dos eventos SSE que não passam pelo pincel (ritmo da bolha).
  function receber(idxBot) {
    return (e) => {
      if (e.type === 'session') setConversa(e.conversation_id)
      const deveRolar = (e.type === 'file' || e.type === 'proposal') && pertoDoFundoRef.current
      if (e.type === 'proposal') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot ? { ...msg, proposta: { proposalId: e.proposalId, descricao: e.descricao, dados: e.dados, comAnexo: e.comAnexo } } : msg
        )))
      }
      if (e.type === 'file') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot
            ? anexarArquivo(msg, { token: e.token, filename: e.filename, mime: e.mime, bytes: e.bytes })
            : msg
        )))
      }
      // Procedência: chega antes do `answer`, então o rodapé nasce junto com a
      // bolha. No reload vem pronto no GET, sem passar por aqui.
      if (e.type === 'sources') {
        setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, fontes: e.items } : msg)))
      }
      // `saved` fecha o turno com o id da linha gravada — é por ele que a
      // avaliação aponta. Só depois disso os polegares fazem sentido.
      if (e.type === 'saved') {
        setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, id: e.message_id } : msg)))
      }
      if (e.type === 'error') {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot ? { ...msg, erro: e.error || 'Não consegui responder agora.' } : msg
        )))
      }
      if (e.type === 'suggestions' && Array.isArray(e.items)) setSugestoes(e.items)
      if (deveRolar) requestAnimationFrame(rolarParaFim)
    }
  }

  async function correr(idxBot, texto, file, signal) {
    setOcupado(true)
    let abortou = false
    let convId = conversa
    const pincel = criarPincel({
      onPaint({ texto: pintado }) {
        setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, texto: pintado } : msg)))
        if (pertoDoFundoRef.current) requestAnimationFrame(rolarParaFim)
      },
    })
    pincelRef.current = pincel
    try {
      await streamChat({
        message: texto,
        conversationId: conversa,
        file,
        signal,
        onEvent: (e) => {
          if (e.type === 'session') convId = e.conversation_id
          if (e.type === 'aborted') abortou = true
          if (e.type === 'token') pincel.empurrar(e.text)
          else if (e.type === 'token_revoke') pincel.revogar()
          else if (e.type === 'answer') {
            pincel.fechar(e.text ?? '')
            setMensagens((m) => m.map((msg, i) => (i === idxBot ? { ...msg, links: e.links } : msg)))
          }
          receber(idxBot)(e)
        },
        context: contextoAtivo,
      })
      await pincel.quandoParar()
      // Só grava o id depois de um turno que não abortou.
      if (!abortou && convId && profile?.id) {
        salvarSessao(profile.id, { conversationId: convId })
        recarregarLista()
      }
    } catch (err) {
      pincel.parar()
      // Abort local é a verdade da UI — não pinta erro, não espera o SSE aborted.
      if (err?.name === 'AbortError' || signal?.aborted) {
        setMensagens((m) => {
          const bot = m[idxBot]
          if (bot?.texto) {
            return m.map((msg, i) => (i === idxBot ? { ...msg, texto: `${msg.texto}\n\nInterrompido` } : msg))
          }
          return m.filter((_, i) => i !== idxBot)
        })
      } else {
        setMensagens((m) => m.map((msg, i) => (
          i === idxBot
            // Limite atingido não é falha: não ganha bloco vermelho nem
            // "tentar de novo", porque tentar de novo não vai adiantar hoje.
            ? (err.code === 'limite_diario'
              ? { ...msg, aviso: err.message }
              : { ...msg, erro: err.message || 'Não consegui responder agora.' })
            : msg
        )))
      }
    } finally {
      pincel.parar()
      if (pincelRef.current === pincel) pincelRef.current = null
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
    setSugestoes([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const ac = new AbortController()
    abortRef.current = ac
    const idxBot = mensagens.length + 1
    setMensagens((m) => [
      ...m,
      { autor: 'user', texto, anexo: fileToSend?.name || null, arquivoObj: fileToSend || null },
      { autor: 'bot', texto: '' },
    ])
    requestAnimationFrame(rolarParaFim)
    await correr(idxBot, texto, fileToSend, ac.signal)
  }

  // Reenvia a pergunta na mesma bolha (erro de resposta). O anexo vai junto: um
  // turno que falhou não foi salvo no servidor, então sem o arquivo o modelo
  // nunca veria o documento — e a bolha continuaria mostrando o clipe, mentindo.
  // Depois de um reload o File se perdeu (não atravessa o localStorage) e o
  // retry manda só o texto; é o melhor possível sem reanexar.
  async function tentarStream(idxBot) {
    const userMsg = mensagens[idxBot - 1]
    if (!userMsg || userMsg.autor !== 'user' || ocupado) return
    const ac = new AbortController()
    abortRef.current = ac
    setMensagens((m) => m.map((msg, i) => (i === idxBot ? limparParaRefazer(msg) : msg)))
    await correr(idxBot, userMsg.texto, userMsg.arquivoObj || undefined, ac.signal)
  }

  // Refazer a última resposta sem redigitar a pergunta. É o mesmo gesto do
  // "Tentar de novo", disponível quando deu certo mas a resposta não serviu.
  //
  // Diferença que importa: um turno que FALHOU nunca foi salvo, mas este deu
  // certo e já está no histórico do servidor. Então isto não apaga a resposta
  // anterior de lá — pergunta de novo. O modelo vê a repetição, e é o melhor
  // possível sem um endpoint que remova o turno.
  async function refazer(idxBot) {
    const userMsg = mensagens[idxBot - 1]
    if (!userMsg || userMsg.autor !== 'user' || ocupado) return
    const ac = new AbortController()
    abortRef.current = ac
    setMensagens((m) => m.map((msg, i) => (i === idxBot ? limparParaRefazer(msg) : msg)))
    await correr(idxBot, userMsg.texto, userMsg.arquivoObj || undefined, ac.signal)
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

  async function baixar(idx, token) {
    const alvo = arquivosDaMensagem(mensagens[idx]).find((a) => a.token === token)
      || arquivosDaMensagem(mensagens[idx])[0]
    if (!alvo?.token) return
    try {
      await downloadAgentFile(alvo.token)
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
    // Não DELETE — a conversa persistida permanece na lista.
    limparSessao()
    setMensagens([])
    setConversa(null)
    setInput('')
    setArquivo(null)
    setAnexoErro(null)
    setSugestoes([])
    setPainelAberto(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()
  }

  async function selecionarConversa(id) {
    if (!id || id === conversa || ocupado) return
    try {
      const c = await getConversation(id)
      setMensagens(c.messages || [])
      setConversa(c.id)
      setSugestoes([])
      if (profile?.id) salvarSessao(profile.id, { conversationId: c.id })
      setPainelAberto(false)
    } catch {
      recarregarLista()
    }
  }

  async function renomearConversa(id, title) {
    try {
      const r = await renameConversation(id, title)
      setItens((xs) => xs.map((x) => (x.id === id ? { ...x, title: r.title } : x)))
    } catch { /* ignore */ }
  }

  async function apagarConversa(id) {
    try {
      await deleteConversation(id)
    } catch { /* 404 = já não era dele */ }
    if (conversa === id) {
      limparSessao()
      setMensagens([])
      setConversa(null)
      setSugestoes([])
    }
    recarregarLista()
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
                  onClick={() => { dispensarContexto(); setContextoAtivo(null) }}
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
                enviar()
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
              onClick={() => {
                pincelRef.current?.despejar()
                abortRef.current?.abort()
              }}
              aria-label="Parar"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-md bg-accent text-white transition-opacity hover:opacity-90"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => enviar()}
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
                  onClick={() => enviar(s)}
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

                      {/* Resume: proposta persistida já nasce expirada — sem Aprovar. */}
                      {m.proposta?.expirado && (
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
                      onClick={() => enviar(s)}
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
