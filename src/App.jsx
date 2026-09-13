import { useEffect, useMemo, useState } from 'react'
import { api, clearPrivateCache, pendingEntries, syncPendingEntries } from './lib/api.js'
import { localDate } from './lib/nutrition.js'
import Today from './views/Today.jsx'
import Foods from './views/Foods.jsx'
import Progress from './views/Progress.jsx'
import Profile from './views/Profile.jsx'
import Modal from './components/Modal.jsx'

const blankProfile = { carbs: 0, protein: 0, fat: 0, sex: 'male', activity: 1.2 }
function Login({ onLogin }) { const [password, setPassword] = useState(''); const [error, setError] = useState(''); const submit = async e => { e.preventDefault(); try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) }); onLogin() } catch (err) { setError(err.message) } }; return <main className="login"><p className="eyebrow">NUTRI</p><h1>Tu nutrición,<br />en claro.</h1><p>Un diario privado, simple y tuyo.</p><form className="form" onSubmit={submit}><label>Contraseña<input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} /></label><button>Entrar</button>{error && <p className="error">{error}</p>}</form></main> }
export default function App() {
  const [auth, setAuth] = useState(null); const [tab, setTab] = useState('Hoy'); const [date, setDate] = useState(localDate()); const [profile, setProfile] = useState(blankProfile); const [foods, setFoods] = useState([]); const [entries, setEntries] = useState([]); const [error, setError] = useState(''); const [undo, setUndo] = useState(null); const [pending, setPending] = useState(0)
  const load = async () => { try { const [p, f, e] = await Promise.all([api('/api/profile'), api('/api/foods'), api(`/api/entries?date=${date}`)]); setProfile(p || blankProfile); setFoods(f || []); setEntries(e || []); setError('') } catch (err) { setError(err.message) } }
  useEffect(() => { api('/api/session').then(session => setAuth(session.authenticated)).catch(() => setAuth(false)) }, [])
  useEffect(() => { if (auth) load() }, [auth, date])
  useEffect(() => { const sync = async () => { const result = await syncPendingEntries(); setPending(pendingEntries().length); if (result.authRequired) { setAuth(false); return } if (auth) load() }; sync(); addEventListener('online', sync); addEventListener('focus', sync); return () => { removeEventListener('online', sync); removeEventListener('focus', sync) } }, [auth, date])
  useEffect(() => { const queued = pendingEntries().map(item => JSON.parse(item.body)).filter(entry => entry.date === date).map(entry => ({ ...entry, pending: true })); if (queued.length) setEntries(current => [...current.filter(entry => !entry.pending), ...queued.filter(item => !current.some(entry => entry.id === item.id))]) }, [date])
  const add = async entry => { setEntries(current => [...current, entry]); try { const saved = await api('/api/entries', { method: 'POST', body: JSON.stringify(entry) }); setEntries(current => current.map(item => item.id === entry.id ? saved : item)); setPending(pendingEntries().length) } catch (err) { setEntries(current => current.filter(item => item.id !== entry.id)); setError(err.message) } }
  const edit = async entry => { const quantity = prompt(`Cantidad de ${entry.food.basis}:`, entry.quantity); if (quantity === null || !Number(quantity)) return; try { const updated = await api(`/api/entries/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ quantity: Number(quantity) }) }); setEntries(current => current.map(item => item.id === entry.id ? updated : item)) } catch (err) { setError(err.message) } }
  const remove = async entry => { setEntries(current => current.filter(item => item.id !== entry.id)); setUndo(entry); try { await api(`/api/entries/${entry.id}`, { method: 'DELETE' }) } catch (err) { setEntries(current => [...current, entry]); setError(err.message) } }
  const restore = async () => { if (!undo) return; const entry = undo; setUndo(null); await add({ ...entry, id: crypto.randomUUID() }) }
  const copy = async () => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - 1); try { const prior = await api(`/api/entries?date=${localDate(d)}`); await Promise.all(prior.map(entry => add({ ...entry, id: crypto.randomUUID(), date }))) } catch (err) { setError(err.message) } }
  const saveProfile = async value => { const saved = await api('/api/profile', { method: 'PUT', body: JSON.stringify(value) }); setProfile(saved) }
  const logout = async () => { await api('/api/logout', { method: 'POST' }); clearPrivateCache(); setEntries([]); setFoods([]); setAuth(false) }
  const view = useMemo(() => ({ Hoy: <Today date={date} setDate={setDate} entries={entries} profile={profile} foods={foods} onAdd={add} onEdit={edit} onDelete={remove} onCopy={copy} />, Alimentos: <Foods foods={foods} onFoods={setFoods} />, Progreso: <Progress />, Perfil: <Profile profile={profile} onSave={saveProfile} onLogout={logout} pending={pending} /> })[tab], [tab, date, entries, profile, foods, pending])
  if (auth === null) return <main className="login"><p className="muted">Cargando tu diario…</p></main>
  if (!auth) return <Login onLogin={() => setAuth(true)} />
  return <div className="app-shell">{error && <div className="toast error">{error}<button onClick={() => setError('')}>×</button></div>}{view}{undo && <div className="undo">Entrada eliminada <button onClick={restore}>Deshacer</button><button onClick={() => setUndo(null)}>×</button></div>}<nav>{['Hoy', 'Alimentos', 'Progreso', 'Perfil'].map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}><span>{({ Hoy: '◉', Alimentos: '⌕', Progreso: '⌁', Perfil: '○' })[item]}</span>{item}</button>)}</nav></div>
}
