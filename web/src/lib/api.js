const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

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
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    localStorage.removeItem('profile')
    window.location.href = '/login'
    throw new Error('Sessão expirada.')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição.')
  }

  return data
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
}
