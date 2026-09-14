import { useMemo, useState } from 'react'
import { scaleNutrients, sumNutrients, selectZero } from '../lib/nutrition.js'

const formatNutrient = (key, value) => (key === 'kcal' ? '' : key[0].toUpperCase()) + (value == null ? '—' : Math.round(value)) + (key === 'kcal' ? ' kcal' : 'g')

export default function RecipeBuilder({ foods, onSave, onCancel }) {
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

  return <form className="form" onSubmit={save}>
    <p className="muted">Las cantidades de ingredientes se convierten a valores por 100 g del plato terminado.</p>
    <label>Nombre de la receta<input required value={name} onChange={event => setName(event.target.value)} placeholder="Ej. Lentejas caseras" /></label>
    <label>Rendimiento final (g)<input required type="number" min="1" inputMode="decimal" value={yieldGrams} onFocus={selectZero} onChange={event => setYieldGrams(event.target.value)} /></label>
    <div className="recipe-add">
      <select value={foodId} onChange={event => setFoodId(event.target.value)}><option value="">Ingrediente…</option>{foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}</select>
      <input type="number" min="1" inputMode="decimal" value={quantity} onFocus={selectZero} onChange={event => setQuantity(event.target.value)} aria-label="Cantidad del ingrediente" />
      <button type="button" disabled={!foodId || !Number.isFinite(quantityNumber) || quantityNumber <= 0} onClick={addPart}>Añadir</button>
    </div>
    {parts.map((part, index) => <div className="recipe-part" key={part.food.id + '-' + index}>
      <span>{part.food.name} · {part.quantity} g</span>
      <button type="button" className="delete" onClick={() => setParts(current => current.filter((_, i) => i !== index))}>×</button>
    </div>)}
    <div className="recipe-total"><span>Por 100 g</span><b>{Object.entries(per100).map(([key, value]) => formatNutrient(key, value)).join(' · ')}</b></div>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button disabled={!parts.length || saving}>{saving ? 'Guardando…' : 'Guardar receta'}</button></footer>
  </form>
}
