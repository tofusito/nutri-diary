const CACHE_PREFIX = 'nutri-cache:'
const QUEUE_KEY = 'nutri-entry-queue'

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value))

export function pendingEntries() { return read(QUEUE_KEY, []) }

export async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const cacheKey = `${CACHE_PREFIX}${path}`
  try {
    const response = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options })
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
    if (method === 'GET' && !error.status) {
      const cached = read(cacheKey, undefined)
      if (cached !== undefined) return cached
    }
    const isNetwork = !error.status && !navigator.onLine
    if (method === 'POST' && path === '/api/entries' && isNetwork && options.body) {
      const item = { id: crypto.randomUUID(), path, body: options.body, createdAt: Date.now() }
      write(QUEUE_KEY, [...pendingEntries(), item])
      return { ...JSON.parse(options.body), pending: true, id: JSON.parse(options.body).id }
    }
    throw error
  }
}

export async function syncPendingEntries() {
  const queued = pendingEntries()
  if (!queued.length || !navigator.onLine) return 0
  const remaining = []
  let synced = 0; let authRequired = false
  for (const item of queued) {
    try {
      const response = await fetch(item.path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: item.body })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) authRequired = true
        remaining.push(item)
      } else synced += 1
    } catch { remaining.push(item) }
  }
  write(QUEUE_KEY, remaining)
  return { synced, authRequired }
}

export function clearPrivateCache() {
  Object.keys(localStorage).filter(key => key.startsWith(CACHE_PREFIX) || key === QUEUE_KEY).forEach(key => localStorage.removeItem(key))
}
