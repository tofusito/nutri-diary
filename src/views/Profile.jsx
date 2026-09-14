import { useEffect, useState } from 'react'
import { estimateEnergy, macroCalories, number, selectZero } from '../lib/nutrition.js'

const activities = [[1.2, 'Sedentario', 'poco o nada de ejercicio'], [1.375, 'Ligera', '1-3 días por semana'], [1.55, 'Moderada', '3-5 días por semana'], [1.725, 'Alta', '6-7 días por semana'], [1.9, 'Muy alta', 'trabajo físico o doble sesión']]
const blank = name => ({ id: crypto.randomUUID(), name, carbs: 0, protein: 0, fat: 0, sex: 'male', activity: 1.55 })

export default function Profile({ profiles, profileId, onSave, onCreate, onDelete, onSwitch, onLogout, pending }) {
  const active = profiles.find(item => item.id === profileId) || profiles[0] || blank('')
  const [draft, setDraft] = useState(active)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(active); setCreating(false); setMessage('') }, [active.id])

  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: number(value) }))
  const validMacros = ['carbs', 'protein', 'fat'].every(key => Number.isFinite(draft[key]) && draft[key] >= 0)
  const kcal = validMacros ? macroCalories(draft) : '—'
  let estimate = null
  try { estimate = draft.weight && draft.height && draft.age ? estimateEnergy({ ...draft, sex: draft.sex || 'male', activity: draft.activity || 1.2 }) : null } catch { estimate = null }

  const submit = async event => {
    event.preventDefault()
    if (saving) return
    if (!validMacros) return setMessage('Completa los tres macros con un número igual o mayor que cero.')
    if (!String(draft.name || '').trim()) return setMessage('Ponle un nombre al perfil.')
    setSaving(true)
    try { await (creating ? onCreate(draft) : onSave(draft)); setCreating(false); setMessage('Perfil guardado.') }
    catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }
  const applyEstimate = () => {
    if (!estimate) return
    const kcalTarget = estimate.maintenance
    setDraft(previous => ({ ...previous, carbs: Math.round(kcalTarget * 0.4 / 4), protein: Math.round(kcalTarget * 0.3 / 4), fat: Math.round(kcalTarget * 0.3 / 9) }))
    setMessage('Reparto 40/30/30 sobre tu mantenimiento. Revísalo y guarda.')
  }
  const remove = async () => {
    if (!confirm(`¿Eliminar el perfil «${active.name}» y todo su diario?`)) return
    try { await onDelete(active.id) } catch (error) { setMessage(error.message) }
  }

  return <main>
    <div className="page-heading"><div><p className="eyebrow">PERFIL</p><h1>{creating ? 'Nuevo perfil' : active.name || 'Tu perfil'}</h1></div>
      {pending > 0 && <span className="pending-pill">{pending} pendiente{pending > 1 ? 's' : ''}</span>}</div>

    {!creating && <div className="profile-switch">
      <button className="chip" onClick={() => { setCreating(true); setDraft(blank('')) }}>+ Crear otro perfil</button>
    </div>}

    <form className="form profile-form" onSubmit={submit}>
      <section>
        <h2>Datos</h2>
        <label>Nombre<input required value={draft.name || ''} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} placeholder="Ej. Manu" /></label>
        <div className="two-col">
          <label>Peso (kg)<input type="number" min="1" step="0.1" value={draft.weight ?? ''} onChange={event => set('weight', event.target.value)} /></label>
          <label>Altura (cm)<input type="number" min="1" value={draft.height ?? ''} onChange={event => set('height', event.target.value)} /></label>
          <label>Edad<input type="number" min="1" value={draft.age ?? ''} onChange={event => set('age', event.target.value)} /></label>
          <label>Género<select value={draft.sex || 'male'} onChange={event => setDraft(previous => ({ ...previous, sex: event.target.value }))}><option value="male">Hombre</option><option value="female">Mujer</option></select></label>
        </div>
        <label>Ejercicio por semana<select value={draft.activity || 1.55} onChange={event => set('activity', event.target.value)}>{activities.map(([value, label, hint]) => <option key={value} value={value}>{label} · {hint}</option>)}</select></label>
      </section>

      <section>
        <h2>Objetivo diario</h2>
        <p className="muted">Las calorías salen de tus macros: 4 kcal/g de hidratos y proteína, 9 kcal/g de grasa.</p>
        <div className="kcal-result"><strong>{kcal} kcal</strong><span>objetivo de {draft.name || 'este perfil'}</span></div>
        <div className="macro-inputs">{[['carbs', 'Hidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']].map(([key, label]) =>
          <label key={key}>{label}<input aria-label={label} required type="number" min="0" step="any" inputMode="decimal" value={draft[key] ?? ''} onFocus={selectZero} onChange={event => set(key, event.target.value)} /><small>gramos</small></label>)}</div>
      </section>

      <section>
        <h2>Estimación energética</h2>
        <p className="muted">Opcional. Ecuación de Mifflin-St Jeor (1990). No cambia tu objetivo sola.</p>
        {estimate ? <>
          <div className="estimate"><span>Basal <b>{estimate.resting} kcal</b></span><span>Factor <b>×{draft.activity || 1.2}</b></span><span>Mantenimiento <b>{estimate.maintenance} kcal</b></span></div>
          <button type="button" className="secondary full" onClick={applyEstimate}>Rellenar macros con 40/30/30 del mantenimiento</button>
        </> : <p className="empty">Completa peso, altura y edad para verla.</p>}
      </section>

      <button type="submit" disabled={saving}>{saving ? 'Guardando…' : creating ? 'Crear perfil' : 'Guardar perfil'}</button>
      {message && <p role="status" className={message === 'Perfil guardado.' ? 'success' : 'error'}>{message}</p>}
    </form>

    <section className="account">
      <h2>Cuenta</h2>
      <button className="secondary full" onClick={onSwitch}>Cambiar de perfil</button>
      <p className="muted">Vuelve a la pantalla de selección, por si has entrado con el perfil equivocado.</p>
      {!creating && profiles.length > 1 && <button className="link-button" onClick={remove}>Eliminar «{active.name}» y su diario</button>}
      <button className="link-button" onClick={onLogout}>Cerrar sesión</button>
    </section>
  </main>
}
