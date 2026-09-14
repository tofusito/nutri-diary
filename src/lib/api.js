const CACHE_PREFIX = 'nutri-cache:'
const QUEUE_KEY = 'nutri-entry-queue'

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } }

export function pendingEntries() {
  const value = read(QUEUE_KEY, [])
  return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.path === 'string' && typeof item.body === 'string') : []
}

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const cacheKey = `${CACHE_PREFIX}${path}`
  try {
    const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
    if (response.redirected || (response.ok && response.status !== 204 && !response.headers.get('content-type')?.includes('application/json'))) {
      const error = new Error('La sesión ha caducado. Recarga el diario para volver a entrar.'); error.status = 401; throw error
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const error = new Error(body.error || 'No se ha podido completar la solicitud.')
      error.status = response.status
      throw error
    }
    const data = response.status === 204 ? null : await response.json()
    if (method === 'GET') write(cacheKey, data)
    return data
  } catch (error) {
    if (method === 'GET' && !error.status && path !== '/api/session') {
      const cached = read(cacheKey, undefined)
      if (cached !== undefined) return cached
    }
    const isNetwork = !error.status && !navigator.onLine
    if (method === 'POST' && path.split('?')[0] === '/api/entries' && isNetwork && options.body) {
      const item = { id: crypto.randomUUID(), path, body: options.body, createdAt: Date.now() }
      if (!write(QUEUE_KEY, [...pendingEntries(), item])) throw new Error('No hay espacio para guardar sin conexión. Conéctate e inténtalo otra vez.')
      return { ...JSON.parse(options.body), pending: true, id: JSON.parse(options.body).id }
    }
    throw error
  }
}

let syncing = null
export function syncPendingEntries() {
  if (!syncing) syncing = syncQueue().finally(() => { syncing = null })
  return syncing
}
async function syncQueue() {
  const queued = pendingEntries()
  if (!queued.length || !navigator.onLine) return { synced: 0, authRequired: false }
  const remaining = []
  let synced = 0; let authRequired = false
  for (const item of queued) {
    try {
      const response = await fetch(item.path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: item.body })
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json')) {
        if (response.redirected || response.status === 401 || response.status === 403) authRequired = true
        remaining.push(item)
      } else synced += 1
    } catch { remaining.push(item) }
  }
  const completed = new Set(queued.filter(item => !remaining.some(other => other.id === item.id)).map(item => item.id))
  write(QUEUE_KEY, pendingEntries().filter(item => !completed.has(item.id)))
  return { synced, authRequired }
}

export function clearPrivateCache() {
  try { Object.keys(localStorage).filter(key => key.startsWith(CACHE_PREFIX) || key === QUEUE_KEY).forEach(key => localStorage.removeItem(key)) } catch { /* Storage can be unavailable in private browsing. */ }
}
