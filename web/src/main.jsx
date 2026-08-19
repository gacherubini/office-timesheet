import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AgentProvider } from './contexts/AgentContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import '@fontsource-variable/funnel-sans'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Por fora dos providers de propósito: erro dentro do AuthProvider ou do
        router também precisa cair aqui, senão volta a dar tela branca. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          {/* Fora do App de propósito: o estado da conversa precisa sobreviver
              à navegação entre rotas, senão o painel perde o fio ao mudar de
              página — que é justamente o que o item 11 pede para não acontecer. */}
          <AgentProvider>
            <App />
          </AgentProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
