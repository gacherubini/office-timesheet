const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Mensagens do requireAuth (backend, middleware/auth.js) que significam
// "a identidade deste token não vale mais": o perfil sumiu, foi apagado ou
// desativado. São 403, não 401, mas o efeito para quem está usando é o mesmo
// do 401 — insistir não adianta, tem que relogar.
//
// O que NÃO entra aqui: 403 de falta de permissão numa ação específica ("Sem
// permissão para esta ação."). Nesse caso a sessão está viva e derrubá-la
// seria pior que o problema original.
const SESSAO_MORTA = new Set([
  'Perfil não encontrado.',
  'Usuário deletado.',
  'Usuário inativo.',
])

function encerrarSessao() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user')
  localStorage.removeItem('profile')
  window.location.href = '/login'
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('access_token')

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, config)

  if (res.status === 401) {
    encerrarSessao()
    throw new Error('Sessão expirada.')
  }

  if (res.status === 204) {
    return null
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  // Precisa vir depois de ler o corpo: só a mensagem distingue "seu token não
  // aponta mais para ninguém" de "você não pode fazer isso".
  if (res.status === 403 && SESSAO_MORTA.has(data?.error)) {
    encerrarSessao()
    throw new Error('Sessão expirada.')
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Erro na requisição.')
  }

  return data
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
}
