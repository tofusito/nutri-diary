import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { scaleNutrients, nutrientText, meals, localDate, selectZero } from '../lib/nutrition.js'
import Macros from './Macros.jsx'
import Modal from './Modal.jsx'
import { plainField, numberField } from '../lib/fields.js'

/** Editing a logged portion: the same controls as adding it, instead of the bare
 *  browser prompt this replaced. Meal and date are editable because mis-tapping
 *  a meal is the easiest mistake to make and the hardest to undo. */
const sameFood = (a, b) => a?.id && b?.id
  ? a.id === b.id
  : a?.barcode && b?.barcode
    ? a.barcode === b.barcode && a.name === b.name
    : a?.name === b?.name && (a?.brand || '') === (b?.brand || '')

export default function EditEntry({ entry, profile, profiles, onSave, onAdd, onDelete, onClose }) {
  const [quantity, setQuantity] = useState(entry.quantity)
  const [meal, setMeal] = useState(entry.meal)
  const [date, setDate] = useState(entry.date)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [alsoFor, setAlsoFor] = useState({})
  const [existingFor, setExistingFor] = useState(new Set())
  const [checking, setChecking] = useState(false)
  const checkRequest = useRef(0)
  const entryIds = useRef({})

  const others = useMemo(() => (profiles || []).filter(item => item.id !== profile?.id), [profiles, profile?.id])

  const valid = Number.isFinite(Number(quantity)) && Number(quantity) > 0
  const portion = scaleNutrients(entry.food.nutrients, valid ? Number(quantity) : 0)
  const changed = Number(quantity) !== entry.quantity || meal !== entry.meal || date !== entry.date

  useEffect(() => {
    const ticket = ++checkRequest.current
    if (!others.length) { setExistingFor(new Set()); setChecking(false); return }
    setChecking(true); setExistingFor(new Set())
    Promise.all(others.map(async person => {
      const rows = await api(`/api/entries?date=${encodeURIComponent(date)}&profile=${person.id}`)
      return [person.id, rows.some(item => item.meal === meal && sameFood(item.food, entry.food))]
    })).then(results => {
      if (ticket !== checkRequest.current) return
      const existing = new Set(results.filter(([, found]) => found).map(([id]) => id))
      setExistingFor(existing)
      setAlsoFor(current => Object.fromEntries(Object.entries(current).filter(([id]) => !existing.has(id))))
    }).catch(() => {
      // Saving performs the same check again and will show a useful error.
    }).finally(() => { if (ticket === checkRequest.current) setChecking(false) })
    return () => { checkRequest.current++ }
  }, [date, meal, entry.food, others])

  const run = async (action) => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action(); onClose() } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const save = async () => {
    if (busy) return
    if (!valid) return setMessage('Introduce una cantidad mayor que cero.')
    if (!Object.values(alsoFor).every(value => Number.isFinite(Number(value)) && Number(value) > 0)) return setMessage('Introduce una cantidad mayor que cero para cada persona.')
    const selected = Object.entries(alsoFor).map(([id, grams]) => ({ id, quantity: Number(grams) }))
    if (!changed && !selected.length) return onClose()

    setBusy(true); setMessage('')
    try {
      // Recheck immediately before writing so a second phone cannot turn this
      // convenience into an accidental duplicate between opening and saving.
      const duplicates = []
      for (const target of selected) {
        const rows = await api(`/api/entries?date=${encodeURIComponent(date)}&profile=${target.id}`)
        if (rows.some(item => item.meal === meal && sameFood(item.food, entry.food))) duplicates.push(target.id)
      }
      if (duplicates.length) {
        setExistingFor(current => new Set([...current, ...duplicates]))
        setAlsoFor(current => Object.fromEntries(Object.entries(current).filter(([id]) => !duplicates.includes(id))))
        const names = duplicates.map(id => others.find(item => item.id === id)?.name).filter(Boolean).join(', ')
        throw new Error(`${names || 'La otra persona'} ya tiene este alimento en esa comida y día.`)
      }
      if (changed) await onSave({ quantity: Number(quantity), meal, date })
      if (selected.length) {
        const ids = Object.fromEntries(selected.map(target => [target.id, entryIds.current[target.id] || (entryIds.current[target.id] = crypto.randomUUID())]))
        await onAdd({ food: entry.food, meal, date, targets: selected, entryIds: ids })
      }
      onClose()
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }

  return <Modal title="Editar lo registrado" onClose={onClose}
    primary={<button type="button" className="modal-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>}>
    <div className="chosen"><strong>{entry.food.name}</strong>
      <span>{[entry.food.brand, `por 100 ${entry.food.basis}`].filter(Boolean).join(' · ')}</span>
      <div className="food-macros">{nutrientText(entry.food.nutrients.kcal)} kcal <Macros nutrients={entry.food.nutrients} /></div>
    </div>

    <div className="quantity-row"><button className="secondary" onClick={() => setQuantity(q => Math.max(1, Number(q) - 10))}>−10</button>
      <input {...numberField('amount')} type="number" min="1" value={quantity} onFocus={selectZero} onChange={event => setQuantity(event.target.value)} aria-label="Cantidad" enterKeyHint="done" />
      <span>{entry.food.basis}</span><button className="secondary" onClick={() => setQuantity(q => Number(q) + 10)}>+10</button></div>
    <div className="portion-row">{[30, 50, 100, 150, 200, 250].map(size => <button key={size} className="chip" onClick={() => setQuantity(size)}>{size}</button>)}</div>

    <div className="chosen-total">
      <span>En {Number(quantity) || 0} {entry.food.basis}</span>
      <b>{nutrientText(portion.kcal)} kcal</b>
      <small><Macros nutrients={portion} unit=" g" /></small>
    </div>

    <div className="two-col edit-move">
      <label>Comida<select {...plainField('meal')} value={meal} onChange={event => setMeal(event.target.value)}>{meals.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Día<input {...plainField('day')} type="date" value={date} max={localDate()} onChange={event => setDate(event.target.value)} /></label>
    </div>

    {others.length > 0 && <div className="also-for">
      <p className="also-title">Añadir también a otro perfil</p>
      {others.map(item => {
        const grams = alsoFor[item.id]
        const exists = existingFor.has(item.id)
        return <div className={`also-row ${exists ? 'already-shared' : ''}`} key={item.id}>
          <label className="check">
            <input type="checkbox" checked={exists || grams !== undefined} disabled={checking || exists || busy}
              onChange={event => setAlsoFor(current => {
                if (!event.target.checked) { const { [item.id]: removed, ...rest } = current; return rest }
                return { ...current, [item.id]: quantity }
              })} /> {item.name}
          </label>
          {exists
            ? <span className="shared-status">✓ Ya está en su diario</span>
            : grams !== undefined && <span className="also-amount">
              <input {...numberField(`amount_for_${item.id}`)} type="number" min="1" onFocus={selectZero} aria-label={`Cantidad para ${item.name}`}
                value={grams} onChange={event => setAlsoFor(current => ({ ...current, [item.id]: event.target.value }))} enterKeyHint="done" />
              {entry.food.basis}
              <small>{nutrientText(scaleNutrients(entry.food.nutrients, Number(grams) > 0 ? Number(grams) : 0).kcal)} kcal</small>
            </span>}
        </div>
      })}
      {checking && <p className="sharing-check">Comprobando el otro diario…</p>}
    </div>}

    {message && <p className="error" role="alert">{message}</p>}

    {confirming
      ? <div className="confirm-row">
          <span>¿Eliminar «{entry.food.name}» de este día?</span>
          <button className="secondary" onClick={() => setConfirming(false)}>No</button>
          <button className="danger" disabled={busy} onClick={() => run(onDelete)}>Sí, eliminar</button>
        </div>
      : <button className="link-button danger" onClick={() => setConfirming(true)}>Eliminar del diario</button>}

  </Modal>
}
