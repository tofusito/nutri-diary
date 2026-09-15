import { useId, useMemo, useState } from 'react'
import { scaleNutrients, sumNutrients, selectZero } from '../lib/nutrition.js'
import Modal from './Modal.jsx'
import { plainField, numberField } from '../lib/fields.js'

const formatNutrient = (key, value) => (key === 'kcal' ? '' : key[0].toUpperCase()) + (value == null ? '—' : Math.round(value)) + (key === 'kcal' ? ' kcal' : 'g')

export default function RecipeBuilder({ foods, onSave, onCancel }) {
  const formId = useId()
  const [name, setName] = useState('')
  const [yieldGrams, setYieldGrams] = useState('')
  const [parts, setParts] = useState([])
  const [foodId, setFoodId] = useState('')
  const [quantity, setQuantity] = useState('100')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const yieldNumber = Number(yieldGrams)
  const quantityNumber = Number(quantity)
  const totals = useMemo(() => sumNutrients(parts.map(part => scaleNutrients(part.food.nutrients, part.quantity))), [parts])
  const per100 = useMemo(() => Object.fromEntries(Object.entries(totals).map(([key, value]) => [
    key, value == null || !Number.isFinite(yieldNumber) || yieldNumber <= 0 ? null : value * 100 / yieldNumber,
  ])), [totals, yieldNumber])

  const addPart = () => {
    const food = foods.find(item => item.id === foodId)
    if (!food || !Number.isFinite(quantityNumber) || quantityNumber <= 0) return setError('Introduce una cantidad mayor que cero.')
    setParts(current => [...current, { food, quantity: quantityNumber }])
    setFoodId('')
    setError('')
  }

  const save = async event => {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Ponle un nombre a la receta.')
    if (!Number.isFinite(yieldNumber) || yieldNumber <= 0) return setError('Introduce un rendimiento final mayor que cero.')
    if (!parts.length) return setError('Añade al menos un ingrediente.')
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: crypto.randomUUID(),
        name: name.trim(),
        brand: '',
        barcode: '',
        basis: 'g',
        nutrients: per100,
        servingSize: 100,
        recipe: { yieldGrams: yieldNumber, ingredients: parts.map(part => ({ foodId: part.food.id, quantity: part.quantity })) },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const primary = <button type="submit" form={formId} className="modal-primary" disabled={!parts.length || saving}>{saving ? 'Guardando…' : 'Guardar'}</button>

  return <Modal title="Nueva receta" onClose={onCancel} primary={primary}>
  <form id={formId} className="form" onSubmit={save} autoComplete="off">
    <p className="muted">Las cantidades de ingredientes se convierten a valores por 100 g del plato terminado.</p>
    <label>Receta<input {...plainField('recipe_title')} required value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Lentejas caseras" enterKeyHint="next" autoCapitalize="sentences" /></label>
    <label>Rendimiento final (g)<input {...numberField('recipe_yield')} required type="number" min="1" value={yieldGrams} onFocus={selectZero} onChange={event => setYieldGrams(event.target.value)} enterKeyHint="next" /></label>
    <div className="recipe-add">
      <select {...plainField('recipe_part')} value={foodId} onChange={event => setFoodId(event.target.value)}><option value="">Ingrediente…</option>{foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}</select>
      <input {...numberField('recipe_part_amount')} type="number" min="1" value={quantity} onFocus={selectZero} onChange={event => setQuantity(event.target.value)} aria-label="Cantidad del ingrediente" enterKeyHint="done" />
      <button type="button" disabled={!foodId || !Number.isFinite(quantityNumber) || quantityNumber <= 0} onClick={addPart}>Añadir</button>
    </div>
    {parts.map((part, index) => <div className="recipe-part" key={part.food.id + '-' + index}>
      <span>{part.food.name} · {part.quantity} g</span>
      <button type="button" className="delete" onClick={() => setParts(current => current.filter((_, i) => i !== index))}>×</button>
    </div>)}
    <div className="recipe-total"><span>Por 100 g</span><b>{Object.entries(per100).map(([key, value]) => formatNutrient(key, value)).join(' · ')}</b></div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>
  </Modal>
}
