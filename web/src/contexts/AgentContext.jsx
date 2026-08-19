import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  streamChat, executeProposal, cancelProposal, downloadAgentFile,
  listConversations, getConversation, renameConversation, deleteConversation,
} from '../lib/agentClient'
import { lerSessao, salvarSessao, limparSessao } from '../lib/agentSession'
import { arquivosDaMensagem, anexarArquivo } from '../lib/agentFiles'
import { lerContexto, dispensarContexto } from '../lib/agentContext'
import { criarPincel } from '../lib/agentPincel'
import { limparParaRefazer } from '../lib/agentAcoes'

const MAX_ANEXO_BYTES = 10 * 1024 * 1024 // espelha o teto do servidor

const Ctx = createContext(null)

// Uma conversa por sessão do usuário, viva acima do router: é o que faz o
// painel lateral e a página /assistente serem a MESMA conversa em vez de duas.
// Ver docs/superpowers/specs/2026-08-18-ajustes-void-a-interface-design.md §4.
export function AgentProvider({ children }) {
  const { profile } = useAuth()

  const [mensagens, setMensagens] = useState([]) // { autor, texto, proposta?, aprovado?, cancelado?, erro?, executando? }
  const [conversa, setConversa] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [arquivo, setArquivo] = useState(null) // File anexado, ainda não enviado
  const [anexoErro, setAnexoErro] = useState(null)
  const [sugestoes, setSugestoes] = useState([])
  const [contextoAtivo, setContextoAtivo] = useState(null)
  const [itens, setItens] = useState([])

  const abortRef = useRef(null)
  const pincelRef = useRef(null)
  // Guarda o DONO já restaurado, não um booleano. O provider é filho estável do
  // AuthProvider e NÃO desmonta no logout (Topbar navega para /login, não dá
  // reload), então um booleano deixaria a conversa do usuário anterior viva em
  // memória para quem logasse na sequência — exatamente o que o escopo por dono
  // do agentSession.js existe para impedir.
  const donoRestauradoRef = useRef(null)

  // A ponte com o DOM: a view ativa registra como rolar a lista DELA. O
  // contexto nunca toca em elemento — só pergunta. Sem isso, o contexto
  // precisaria conhecer o <div> de uma tela específica, e com duas views
  // (página e painel) isso quebra na hora.
  const scrollRef = useRef(null)

  // Devolve a função de desregistro em vez de exigir `registrarScroll(null)`:
  // com duas views vivas ao mesmo tempo (a página montada e o painel aberto por
  // cima), um cleanup cego apagaria o registro de QUEM NÃO SAIU — e o contexto
  // ficaria sem ninguém para rolar. Só limpa se o registrado ainda for o seu.
  const registrarScroll = useCallback((handlers) => {
    scrollRef.current = handlers
    return () => {
      if (scrollRef.current === handlers) scrollRef.current = null
    }
  }, [])

  function pertoDoFundo() {
    return scrollRef.current?.pertoDoFundo?.() ?? false
  }

  function rolarParaFim() {
    scrollRef.current?.rolarParaFim?.()
  }

  useEffect(() => () => { pincelRef.current?.parar() }, [])

  async function recarregarLista() {
    try {
      const data = await listConversations()
      setItens(data?.items || [])
    } catch {
      setItens([])
    }
  }

  // Troca de dono (login, logout, outro login na mesma aba) zera a conversa em
  // memória e restaura a do dono novo. Restaura só o id (v2): o transcript vem
  // do GET — propostas já nascem expiradas. Lista carrega junto. 404 some o id;
  // 503 (kill switch) não.
  useEffect(() => {
    const dono = profile?.id ?? null
    if (donoRestauradoRef.current === dono) return
    donoRestauradoRef.current = dono

    // Nada aqui pertence ao dono novo. Na primeira montagem é no-op; no logout
    // é a única coisa que apaga o transcript, porque o provider sobrevive.
    abortRef.current?.abort()
    abortRef.current = null
    pincelRef.current?.parar()
    pincelRef.current = null
    setMensagens([])
    setConversa(null)
    setOcupado(false)
    setSugestoes([])
    setArquivo(null)
    setAnexoErro(null)
    setItens([])

    if (!dono) return
    recarregarLista()
    const salvo = lerSessao(dono)
    if (!salvo?.conversationId) return
    getConversation(salvo.conversationId)
      .then((c) => {
        // O dono pode ter mudado de novo enquanto o GET voava; sem esta conferência
        // a resposta atrasada repintaria a conversa de quem já saiu.
        if (donoRestauradoRef.current !== dono) return
        setMensagens(c.messages || [])
        setConversa(c.id)
      })
      .catch((err) => {
        if (/não encontrad/i.test(err?.message || '')) limparSessao()
      })
  }, [profile?.id])

  // Chip de contexto: quem lê é a VIEW, quando o chat fica visível (montagem de
  // /assistente, abertura do painel). Não dá para ler uma vez no provider: ele
  // monta com o app, e o carimbo é feito DEPOIS, por outra tela (ProjectPage,
  // GlobalTasksPage, PessoasPage) — a leitura única pegaria sempre o carimbo da
  // carga anterior, e o chip só apareceria depois de um F5.
  // Dismiss vive no sessionStorage, então reler não ressuscita chip dispensado.
  const relerContexto = useCallback(() => {
    setContextoAtivo(lerContexto())
  }, [])

  // Handler dos eventos SSE que não passam pelo pincel (ritmo da bolha).
  function receber(idxBot) {
    return (e) => {
      if (e.type === 'session') setConversa(e.conversation_id)
      const deveRolar = (e.type === 'file' || e.type === 'proposal') && pertoDoFundo()
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
        if (pertoDoFundo()) requestAnimationFrame(rolarParaFim)
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
    const texto = String(textoArg ?? '').trim()
    if ((!texto && !arquivo) || ocupado) return
    const fileToSend = arquivo // capturado ANTES de limpar o estado
    setArquivo(null)
    setAnexoErro(null)
    setSugestoes([])
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

  // Botão "Parar" do composer. Fica aqui porque o pincel e o AbortController
  // são do contexto — a view só aperta o botão, e assim painel e página
  // interrompem o MESMO turno.
  function interromper() {
    pincelRef.current?.despejar()
    abortRef.current?.abort()
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
    setArquivo(null)
    setAnexoErro(null)
    setSugestoes([])
  }

  // Devolve se a conversa realmente entrou na tela. A view precisa saber: o
  // drawer do mobile só pode fechar quando houve troca — recusa (ocupado/mesma
  // conversa) ou falha do GET têm de deixar a lista aberta.
  async function selecionarConversa(id) {
    if (!id || id === conversa || ocupado) return false
    try {
      const c = await getConversation(id)
      setMensagens(c.messages || [])
      setConversa(c.id)
      setSugestoes([])
      if (profile?.id) salvarSessao(profile.id, { conversationId: c.id })
      return true
    } catch {
      recarregarLista()
      return false
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

  function dispensarContextoAtivo() {
    dispensarContexto()
    setContextoAtivo(null)
  }

  const valor = {
    mensagens, conversa, ocupado, arquivo, anexoErro, sugestoes, contextoAtivo, itens,
    setArquivo, setAnexoErro,
    enviar, interromper, tentarStream, refazer, aprovar, baixar, cancelar, escolherArquivo,
    novaConversa, selecionarConversa, renomearConversa, apagarConversa,
    recarregarLista, dispensarContextoAtivo, relerContexto, registrarScroll,
  }

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAgent() {
  const ctx = useContext(Ctx)
  // Falhar alto: um contexto nulo viraria "cannot read property of null" dez
  // frames adiante, longe da causa.
  if (!ctx) throw new Error('useAgent precisa estar dentro de <AgentProvider>.')
  return ctx
}
