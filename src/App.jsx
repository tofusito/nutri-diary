import { useEffect, useMemo, useRef, useState } from 'react'
import { api, clearPrivateCache, pendingEntries, syncPendingEntries } from './lib/api.js'
import { localDate } from './lib/nutrition.js'
import Today from './views/Today.jsx'
import Foods from './views/Foods.jsx'
import Progress from './views/Progress.jsx'
import Profile from './views/Profile.jsx'
import ChooseProfile from './views/ChooseProfile.jsx'
import Icon from './components/Icon.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const PROFILE_KEY = 'nutri-profile'

function Login({ onLogin }) {
  const [password, setPassword] = useState(''); const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) }); onLogin() } catch (err) { setError(err.message) }
  }
  return <main className="login"><img className="brand-icon" src="/noodle-192.png" alt="" /><p className="eyebrow">NUTRI</p><h1>Tu nutrición,<br />en claro.</h1><p>Un diario privado, simple y vuestro.</p>
    <form className="form" onSubmit={submit}><label>Contraseña<input type="password" autoFocus value={password} onChange={event => setPassword(event.target.value)} /></label><button>Entrar</button>{error && <p className="error">{error}</p>}</form></main>
}

export default function App() {
  const [auth, setAuth] = useState(null)
  const [authProvider, setAuthProvider] = useState('password')
  const [authError, setAuthError] = useState('')
  const [tab, setTab] = useState('Hoy')
  const [date, setDate] = useState(localDate())
  const [profiles, setProfiles] = useState(null)
  const [profileId, setProfileId] = useState(() => { try { return localStorage.getItem(PROFILE_KEY) || '' } catch { return '' } })
  const [foods, setFoods] = useState([])
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [undo, setUndo] = useState(null)
  const [pending, setPending] = useState(0)
  const loadId = useRef(0)

  const profile = (profiles || []).find(item => item.id === profileId) || null
  const scope = profile ? `profile=${profile.id}` : ''
  const withScope = path => scope ? `${path}${path.includes('?') ? '&' : '?'}${scope}` : path

  const load = async () => {
    const ticket = ++loadId.current
    try {
      const list = await api('/api/profiles')
      if (ticket !== loadId.current) return
      setProfiles(list)
      const current = list.find(item => item.id === profileId)
      if (!current) return setError('')
      const [f, e] = await Promise.all([api('/api/foods'), api(`/api/entries?date=${date}&profile=${current.id}`)])
      if (ticket !== loadId.current) return
      setFoods(f || []); setEntries(e || []); setError('')
    } catch (err) { if (ticket === loadId.current) setError(err.message) }
  }

  useEffect(() => {
    let alive = true
    api('/api/session')
      .then(session => { if (alive) { setAuthProvider(session.provider || 'password'); setAuthError(''); setAuth(session.authenticated) } })
      .catch(err => { if (alive) { setAuthError(err.message); setAuth(false) } })
    return () => { alive = false }
  }, [])
  useEffect(() => { if (auth) { setEntries([]); load() } return () => { loadId.current++ } }, [auth, date, profileId])
  useEffect(() => {
    const sync = async () => {
      const result = await syncPendingEntries()
      setPending(pendingEntries().length)
      if (result.authRequired) { setAuth(false); return }
      if (auth && result.synced) load()
    }
    sync(); addEventListener('online', sync); addEventListener('focus', sync)
    return () => { removeEventListener('online', sync); removeEventListener('focus', sync) }
  }, [auth, date, profileId])

  const selectProfile = id => {
    setProfileId(id)
    try { if (id) localStorage.setItem(PROFILE_KEY, id); else localStorage.removeItem(PROFILE_KEY) } catch { /* Profile remains selected for this visit. */ }
    setEntries([]); setTab('Hoy')
  }

  const add = async entry => {
    setEntries(current => current.some(item => item.id === entry.id) ? current : [...current, entry])
    try {
      const saved = await api(withScope('/api/entries'), { method: 'POST', body: JSON.stringify({ ...entry, profileId: profile?.id }) })
      setEntries(current => current.map(item => item.id === entry.id ? saved : item)); setPending(pendingEntries().length)
    } catch (err) { setEntries(current => current.filter(item => item.id !== entry.id)); throw err }
  }
  /** One dish cooked for the household: the same food goes into every chosen
   *  diary on the same day, each with its own amount. */
  const addForProfiles = async ({ food, meal, targets, entryIds = {} }) => {
    for (const target of targets) {
      const entry = { id: entryIds[target.id] || crypto.randomUUID(), date, meal, food, quantity: target.quantity }
      if (target.id === profile?.id) { await add(entry); continue }
      try { await api(`/api/entries?profile=${target.id}`, { method: 'POST', body: JSON.stringify({ ...entry, profileId: target.id }) }) }
      catch (err) { throw new Error(`No se ha podido añadir a ${profiles.find(item => item.id === target.id)?.name || 'el otro perfil'}: ${err.message}. Revisa los diarios antes de repetir: las personas anteriores pueden haberse guardado.`) }
    }
  }
  const edit = async entry => {
    const quantity = prompt(`Cantidad en ${entry.food.basis}:`, entry.quantity)
    if (quantity === null) return
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return setError('Introduce una cantidad mayor que cero.')
    try {
      const updated = await api(`/api/entries/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: Number(quantity) }) })
      setEntries(current => current.map(item => item.id === entry.id ? updated : item))
    } catch (err) { setError(err.message) }
  }
  const remove = async entry => {
    setEntries(current => current.filter(item => item.id !== entry.id)); setUndo(entry)
    try { await api(`/api/entries/${entry.id}`, { method: 'DELETE' }) } catch (err) { setEntries(current => [...current, entry]); setUndo(null); setError(err.message) }
  }
  const restore = async () => { if (!undo) return; const entry = undo; setUndo(null); try { await add(entry) } catch (err) { setError(err.message); setUndo(entry) } }
  const copy = async () => {
    const previousDay = new Date(`${date}T12:00:00`); previousDay.setDate(previousDay.getDate() - 1)
    try {
      const prior = await api(withScope(`/api/entries?date=${localDate(previousDay)}`))
      if (!prior.length) return setError('El día anterior está vacío.')
      for (const entry of prior) await add({ ...entry, id: crypto.randomUUID(), date })
    } catch (err) { setError(err.message) }
  }
  const saveProfile = async value => {
    const saved = await api(`/api/profiles/${value.id}`, { method: 'PUT', body: JSON.stringify(value) })
    setProfiles(current => current.map(item => item.id === saved.id ? saved : item))
  }
  const createProfile = async value => {
    const saved = await api('/api/profiles', { method: 'POST', body: JSON.stringify(value) })
    setProfiles(current => [...(current || []), saved]); selectProfile(saved.id)
  }
  const deleteProfile = async id => {
    await api(`/api/profiles/${id}`, { method: 'DELETE' })
    setProfiles(current => (current || []).filter(item => item.id !== id)); selectProfile('')
  }
  const logout = async () => {
    try { await api('/api/logout', { method: 'POST' }); clearPrivateCache(); setEntries([]); setFoods([]); selectProfile(''); if (authProvider === 'cloudflare') { window.location.assign('/cdn-cgi/access/logout'); return } setAuth(false) }
    catch (err) { setError(err.message) }
  }

  const view = useMemo(() => ({
    Hoy: <Today date={date} setDate={setDate} entries={entries} profile={profile} profiles={profiles || []} foods={foods} onFoods={setFoods} onAdd={addForProfiles} onEdit={edit} onDelete={remove} onCopy={copy} />,
    Alimentos: <Foods foods={foods} onFoods={setFoods} />,
    Progreso: <Progress scope={scope} />,
    Perfil: <Profile profiles={profiles || []} profileId={profileId} onSave={saveProfile} onCreate={createProfile} onDelete={deleteProfile} onSwitch={() => selectProfile('')} onLogout={logout} pending={pending} />,
  })[tab], [tab, date, entries, profile, profiles, foods, pending, scope, profileId, authProvider])

  if (auth === null) return <main className="login"><p className="muted">Cargando tu diario…</p></main>
  if (!auth && authError) return <main className="login"><img className="brand-icon" src="/noodle-192.png" alt="" /><p className="error" role="alert">{authError}</p><button onClick={() => window.location.reload()}>Reintentar acceso</button></main>
  if (!auth) return <Login onLogin={() => setAuth(true)} />
  if (profiles === null) return <main className="login">{error ? <><p className="error" role="alert">{error}</p><button onClick={load}>Reintentar</button></> : <p className="muted">Cargando perfiles…</p>}</main>
  if (!profile) return <ChooseProfile profiles={profiles} onSelect={selectProfile} onCreate={createProfile} />
  return <div className="app-shell">
    {error && <div className="toast error">{error}<button onClick={() => setError('')}>×</button></div>}
    <ErrorBoundary key={tab}>{view}</ErrorBoundary>
    {undo && <div className="undo">Entrada eliminada <button onClick={restore}>Deshacer</button><button onClick={() => setUndo(null)}>×</button></div>}
    <nav aria-label="Navegación principal" style={{ '--active-tab': ['Hoy', 'Alimentos', 'Progreso', 'Perfil'].indexOf(tab) }}>{['Hoy', 'Alimentos', 'Progreso', 'Perfil'].map(item =>
      <button key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); window.scrollTo({ top: 0, behavior: 'instant' }) }} aria-current={tab === item ? 'page' : undefined}>
        <Icon name={item.toLowerCase()} />{item}</button>)}</nav>
  </div>
}
