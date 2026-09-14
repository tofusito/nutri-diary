import { useState } from 'react'
import { scaleNutrients, nutrientText, meals, localDate, selectZero } from '../lib/nutrition.js'
import Macros from './Macros.jsx'
import Modal from './Modal.jsx'

/** Editing a logged portion: the same controls as adding it, instead of the bare
 *  browser prompt this replaced. Meal and date are editable because mis-tapping
 *  a meal is the easiest mistake to make and the hardest to undo. */
export default function EditEntry({ entry, onSave, onDelete, onClose }) {
  const [quantity, setQuantity] = useState(entry.quantity)
  const [meal, setMeal] = useState(entry.meal)
  const [date, setDate] = useState(entry.date)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const valid = Number.isFinite(Number(quantity)) && Number(quantity) > 0
  const portion = scaleNutrients(entry.food.nutrients, valid ? Number(quantity) : 0)
  const changed = Number(quantity) !== entry.quantity || meal !== entry.meal || date !== entry.date

  const run = async (action) => {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action(); onClose() } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const save = () => {
    if (!valid) return setMessage('Introduce una cantidad mayor que cero.')
    if (!changed) return onClose()
    return run(() => onSave({ quantity: Number(quantity), meal, date }))
  }

  return <Modal title="Editar lo registrado" onClose={onClose}>
    <div className="chosen"><strong>{entry.food.name}</strong>
      <span>{[entry.food.brand, `por 100 ${entry.food.basis}`].filter(Boolean).join(' · ')}</span>
      <div className="food-macros">{nutrientText(entry.food.nutrients.kcal)} kcal <Macros nutrients={entry.food.nutrients} /></div>
    </div>

    <div className="quantity-row"><button className="secondary" onClick={() => setQuantity(q => Math.max(1, Number(q) - 10))}>−10</button>
      <input type="number" min="1" inputMode="numeric" value={quantity} onFocus={selectZero} onChange={event => setQuantity(event.target.value)} aria-label="Cantidad" />
      <span>{entry.food.basis}</span><button className="secondary" onClick={() => setQuantity(q => Number(q) + 10)}>+10</button></div>
    <div className="portion-row">{[30, 50, 100, 150, 200, 250].map(size => <button key={size} className="chip" onClick={() => setQuantity(size)}>{size}</button>)}</div>

    <div className="chosen-total">
      <span>En {Number(quantity) || 0} {entry.food.basis}</span>
      <b>{nutrientText(portion.kcal)} kcal</b>
      <small><Macros nutrients={portion} unit=" g" /></small>
    </div>

    <div className="two-col edit-move">
      <label>Comida<select value={meal} onChange={event => setMeal(event.target.value)}>{meals.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Día<input type="date" value={date} max={localDate()} onChange={event => setDate(event.target.value)} /></label>
    </div>

    {message && <p className="error" role="alert">{message}</p>}

    {confirming
      ? <div className="confirm-row">
          <span>¿Eliminar «{entry.food.name}» de este día?</span>
          <button className="secondary" onClick={() => setConfirming(false)}>No</button>
          <button className="danger" disabled={busy} onClick={() => run(onDelete)}>Sí, eliminar</button>
        </div>
      : <button className="link-button danger" onClick={() => setConfirming(true)}>Eliminar del diario</button>}

    <footer className="form-actions"><button className="secondary" onClick={onClose}>Cancelar</button>
      <button disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></footer>
  </Modal>
}
