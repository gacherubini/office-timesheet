// Revela o texto da bolha num ritmo de digitação. Os tokens do modelo
// entram na fila na hora; a pintura sai em fatias pequenas. `answer` é
// canônico: o que ainda não apareceu continua a sair no mesmo ritmo.

export const RITMO_PADRAO = {
  charsPerTick: 2,
  tickMs: 48,
  pausaPontuacaoMs: 160,
}

const PONTUACAO = /[.!?…\n]$/

export function criarPincel({
  charsPerTick = RITMO_PADRAO.charsPerTick,
  tickMs = RITMO_PADRAO.tickMs,
  pausaPontuacaoMs = RITMO_PADRAO.pausaPontuacaoMs,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  onPaint = () => {},
} = {}) {
  let fila = ''
  let visivel = ''
  let timer = null
  const esperando = []

  function ocioso() {
    return !fila && !timer
  }

  function avisarIdle() {
    if (!ocioso()) return
    const pendentes = esperando.splice(0)
    for (const r of pendentes) r()
  }

  function atrasoProximo() {
    return PONTUACAO.test(visivel) ? pausaPontuacaoMs : tickMs
  }

  function pintar(andando) {
    onPaint({ texto: visivel, andando })
  }

  function tick() {
    timer = null
    if (!fila) {
      pintar(false)
      avisarIdle()
      return
    }
    const n = Math.min(charsPerTick, fila.length)
    visivel += fila.slice(0, n)
    fila = fila.slice(n)
    const ainda = fila.length > 0
    pintar(ainda)
    if (ainda) timer = schedule(tick, atrasoProximo())
    else avisarIdle()
  }

  function garantirTick() {
    if (timer || !fila) return
    timer = schedule(tick, atrasoProximo())
  }

  return {
    empurrar(text) {
      if (!text) return
      fila += text
      if (timer) return
      tick()
    },
    fechar(canonic) {
      const alvo = canonic == null ? visivel : String(canonic)
      if (alvo.startsWith(visivel)) {
        fila = alvo.slice(visivel.length)
      } else {
        visivel = ''
        fila = alvo
      }
      if (timer) {
        cancel(timer)
        timer = null
      }
      if (!fila) {
        pintar(false)
        avisarIdle()
        return
      }
      tick()
    },
    despejar() {
      if (fila) visivel += fila
      fila = ''
      if (timer) {
        cancel(timer)
        timer = null
      }
      pintar(false)
      avisarIdle()
    },
    revogar() {
      fila = ''
      visivel = ''
      if (timer) {
        cancel(timer)
        timer = null
      }
      pintar(false)
      avisarIdle()
    },
    parar() {
      fila = ''
      if (timer) {
        cancel(timer)
        timer = null
      }
      avisarIdle()
    },
    quandoParar() {
      if (ocioso()) return Promise.resolve()
      return new Promise((resolve) => esperando.push(resolve))
    },
  }
}
