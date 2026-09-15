import { useEffect, useState } from 'react'
import { estimateEnergy, macroCalories, number, selectZero } from '../lib/nutrition.js'
import Icon from '../components/Icon.jsx'
import { plainField, numberField } from '../lib/fields.js'

const activities = [[1.2, 'Sedentario', 'poco o nada de ejercicio'], [1.375, 'Ligera', '1-3 días por semana'], [1.55, 'Moderada', '3-5 días por semana'], [1.725, 'Alta', '6-7 días por semana'], [1.9, 'Muy alta', 'trabajo físico o doble sesión']]
const blank = name => ({ id: crypto.randomUUID(), name, carbs: 0, protein: 0, fat: 0, sex: 'male', activity: 1.55 })
const NOTIFICATION_DURATION_MS = 5_000

export default function Profile({ profiles, profileId, onSave, onCreate, onDelete, onSwitch, onLogout, pending }) {
  const active = profiles.find(item => item.id === profileId) || profiles[0] || blank('')
  const [draft, setDraft] = useState(active)
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState('')
  const [typed, setTyped] = useState('')
  useEffect(() => { setDraft(active); setCreating(false); setMessage(''); setAsking(''); setTyped('') }, [active.id])
  useEffect(() => {
    if (message !== 'Perfil guardado.') return
    const timer = setTimeout(() => setMessage(''), NOTIFICATION_DURATION_MS)
    return () => clearTimeout(timer)
  }, [message])

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
  // Deleting a profile takes its whole diary with it and cannot be undone, so
  // it asks for the name rather than settling for a second tap.
  const remove = async () => {
    if (typed.trim() !== active.name) return
    setSaving(true)
    try { await onDelete(active.id) } catch (error) { setMessage(error.message); setSaving(false); setAsking('') }
  }
  const close = () => { setAsking(''); setTyped('') }

  return <main>
    <div className="page-heading"><div><p className="eyebrow">PERFIL</p><h1>{creating ? 'Nuevo perfil' : active.name || 'Tu perfil'}</h1></div>
      {pending > 0 && <span className="pending-pill">{pending} pendiente{pending > 1 ? 's' : ''}</span>}</div>

    {!creating && <div className="profile-switch">
      <button className="chip" onClick={() => { setCreating(true); setDraft(blank('')) }}>+ Crear otro perfil</button>
    </div>}

    <form className="form profile-form" onSubmit={submit}>
      <section>
        <h2>Datos</h2>
        <label>Nombre<input {...plainField('profile_label')} required value={draft.name || ''} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} placeholder="Ej. Manu" enterKeyHint="next" autoCapitalize="words" /></label>
        <div className="two-col">
          <label>Peso (kg)<input {...numberField('body_weight')} type="number" min="1" step="0.1" value={draft.weight ?? ''} onChange={event => set('weight', event.target.value)} enterKeyHint="next" /></label>
          <label>Altura (cm)<input {...numberField('body_height', { inputMode: 'numeric' })} type="number" min="1" value={draft.height ?? ''} onChange={event => set('height', event.target.value)} enterKeyHint="next" /></label>
          <label>Edad<input {...numberField('body_years', { inputMode: 'numeric' })} type="number" min="1" value={draft.age ?? ''} onChange={event => set('age', event.target.value)} enterKeyHint="next" /></label>
          <label>Género<select {...plainField('equation_sex')} value={draft.sex || 'male'} onChange={event => setDraft(previous => ({ ...previous, sex: event.target.value }))}><option value="male">Hombre</option><option value="female">Mujer</option></select></label>
        </div>
        <label>Ejercicio por semana<select {...plainField('activity')} value={draft.activity || 1.55} onChange={event => set('activity', event.target.value)}>{activities.map(([value, label, hint]) => <option key={value} value={value}>{label} · {hint}</option>)}</select></label>
      </section>

      <section>
        <h2>Objetivo diario</h2>
        <p className="muted">Las calorías salen de tus macros: 4 kcal/g de hidratos y proteína, 9 kcal/g de grasa.</p>
        <div className="kcal-result"><strong>{kcal} kcal</strong><span>objetivo de {draft.name || 'este perfil'}</span></div>
        <div className="macro-inputs">{[['carbs', 'Hidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']].map(([key, label]) =>
          <label key={key}>{label}<input {...numberField(`goal_${key}`)} aria-label={label} required type="number" min="0" step="any" value={draft[key] ?? ''} onFocus={selectZero} onChange={event => set(key, event.target.value)} /><small>gramos</small></label>)}</div>
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
      <div className="account-actions">
        <button type="button" className="icon-action" onClick={() => { setTyped(''); setAsking(asking === 'switch' ? '' : 'switch') }}
          aria-expanded={asking === 'switch'} aria-label="Cambiar de perfil"><Icon name="swap" /><span>Cambiar</span></button>
        {!creating && profiles.length > 1 && <button type="button" className="icon-action danger" onClick={() => { setTyped(''); setAsking(asking === 'delete' ? '' : 'delete') }}
          aria-expanded={asking === 'delete'} aria-label={`Eliminar el perfil ${active.name}`}><Icon name="trash" /><span>Eliminar</span></button>}
      </div>

      {asking === 'switch' && <div className="confirm-row">
        <span>¿Volver a la pantalla de selección de perfil? No se pierde nada.</span>
        <button type="button" className="secondary" onClick={close}>No</button>
        <button type="button" onClick={onSwitch}>Sí, cambiar</button>
      </div>}

      {asking === 'delete' && <div className="confirm-row danger-panel">
        <span>Esto borra <b>{active.name}</b> y todo su diario, sin vuelta atrás. Escribe <b>{active.name}</b> para confirmarlo.</span>
        <input {...plainField('confirm_delete')} value={typed} onChange={event => setTyped(event.target.value)} aria-label={`Escribe ${active.name} para confirmar`} placeholder={active.name} autoCorrect="off" autoCapitalize="none" spellCheck={false} />
        <button type="button" className="secondary" onClick={close}>Cancelar</button>
        <button type="button" className="danger" disabled={saving || typed.trim() !== active.name} onClick={remove}>{saving ? 'Eliminando…' : 'Eliminar'}</button>
      </div>}

      <button type="button" className="link-button" onClick={onLogout}>Cerrar sesión</button>
      <p className="build">Versión {typeof __BUILD__ === 'string' ? __BUILD__ : 'de desarrollo'}</p>
    </section>
  </main>
}
