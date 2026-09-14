import { useRef, useState } from 'react'
import { safeMacroCalories } from '../lib/nutrition.js'

/** Shown right after signing in: the diary always belongs to one person, so the
 *  profile is chosen once here instead of being switched around inside the app. */
export default function ChooseProfile({ profiles, onSelect, onCreate }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const createId = useRef(crypto.randomUUID())

  const create = async event => {
    event.preventDefault()
    if (!name.trim()) return
    try { await onCreate({ id: createId.current, name: name.trim(), carbs: 0, protein: 0, fat: 0, sex: 'male', activity: 1.55 }) }
    catch (err) { setError(err.message) }
  }

  return <main className="chooser">
    <p className="eyebrow">NUTRI</p>
    <h1>¿Quién registra hoy?</h1>
    <p className="muted">Elige tu perfil. Cada uno lleva su diario y sus objetivos; la biblioteca de alimentos es común.</p>

    <div className="chooser-list">{profiles.map(item =>
      <button key={item.id} className="chooser-card" onClick={() => onSelect(item.id)}>
        <span className="chooser-avatar">{item.name.trim().charAt(0).toUpperCase() || '·'}</span>
        <span><strong>{item.name}</strong><small>{safeMacroCalories(item) ? `${safeMacroCalories(item)} kcal al día` : 'sin objetivo todavía'}</small></span>
      </button>)}</div>

    {creating
      ? <form className="form" onSubmit={create}>
          <label>Nombre del perfil<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Manu" /></label>
          <div className="form-actions"><button type="button" className="secondary" onClick={() => setCreating(false)}>Cancelar</button><button type="submit">Crear y entrar</button></div>
        </form>
      : <button className="secondary full" onClick={() => setCreating(true)}>+ Crear un perfil nuevo</button>}
    {error && <p className="error">{error}</p>}
  </main>
}
