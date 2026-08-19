/** @vitest-environment jsdom */
// A rota /catalogo-etapas checava canManageProjects por dentro da própria
// página e redirecionava com <Navigate> — um mecanismo diferente das outras
// rotas protegidas (adminOnly, approverOnly), que barram ANTES de renderizar
// a página. Este teste cobre o prop novo (projectManagerOnly) que unifica o
// gate em ProtectedRoute, seguindo exatamente o padrão de adminOnly e
// approverOnly já existentes.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

let mockAuth

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}))

function renderComProtecao() {
  return render(
    <MemoryRouter initialEntries={['/catalogo-etapas']}>
      <Routes>
        <Route
          path="/catalogo-etapas"
          element={
            <ProtectedRoute projectManagerOnly>
              <p>conteúdo restrito</p>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProtectedRoute — projectManagerOnly', () => {
  it('deixa passar quem gerencia projetos', () => {
    mockAuth = { profile: { role: 'admin' }, loading: false, isAdmin: true, isAdministrativeIntern: false, canApproveRequests: false, canManageProjects: true }
    renderComProtecao()
    expect(screen.getByText('conteúdo restrito')).toBeTruthy()
  })

  it('redireciona quem não gerencia projetos', () => {
    mockAuth = { profile: { role: 'employee' }, loading: false, isAdmin: false, isAdministrativeIntern: false, canApproveRequests: false, canManageProjects: false }
    renderComProtecao()
    expect(screen.queryByText('conteúdo restrito')).toBeNull()
    expect(screen.getByText('home')).toBeTruthy()
  })

  it('sem o prop, não filtra por gestão de projetos', () => {
    mockAuth = { profile: { role: 'employee' }, loading: false, isAdmin: false, isAdministrativeIntern: false, canApproveRequests: false, canManageProjects: false }
    render(
      <MemoryRouter initialEntries={['/qualquer']}>
        <Routes>
          <Route path="/qualquer" element={<ProtectedRoute><p>conteúdo livre</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('conteúdo livre')).toBeTruthy()
  })
})
