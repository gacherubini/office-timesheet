import { Component } from 'react'
import { AlertCircle } from 'lucide-react'

// Rede de segurança para exceção durante o render. Sem ela, o React desmonta a
// árvore inteira e sobra uma página BRANCA — sem mensagem, sem botão, sem
// pista. Foi o que aconteceu quando `Check` faltou no import do assistente: a
// ação tinha funcionado no servidor, mas a tela sumia ao confirmar.
//
// Não conserta bug nenhum; troca "sumiu tudo" por "quebrou aqui, e foi isto".
// A mensagem técnica fica à vista de propósito: é o que transforma um relato
// de "ficou branco" em diagnóstico direto.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // Prefixo fixo para achar no console e no filtro do DevTools.
    console.error('[ErrorBoundary] render quebrou:', erro, info?.componentStack)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children

    return (
      <div role="alert" className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-md border border-border-subtle bg-surface p-6">
          <p className="flex items-center gap-2 text-text-primary">
            <AlertCircle size={18} className="state-danger flex-none" aria-hidden />
            Algo quebrou nesta tela.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            O erro é da interface, não dos seus dados — nada que você já tinha salvo se perdeu.
            Se continuar acontecendo, manda um print desta tela.
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-surface-alt px-3 py-2 text-xs text-text-secondary">
            {erro?.message || String(erro)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Recarregar a página
          </button>
        </div>
      </div>
    )
  }
}
