import { api } from './api'

// Cache por ano no módulo — feriados de um ano não mudam durante a sessão.
const cache = new Map()

export async function fetchHolidays(year) {
  const y = year || new Date().getFullYear()
  if (cache.has(y)) return cache.get(y)
  const data = await api.get(`/holidays?year=${y}`)
  const list = Array.isArray(data) ? data : []
  cache.set(y, list)
  return list
}
