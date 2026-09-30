import { useState } from 'react'
import { api } from '../lib/api.js'
import { scaleNutrients } from '../lib/nutrition.js'
import { foodFromMealTotals } from '../../shared/meal-estimate.js'
import { plainField, numberField } from '../lib/fields.js'
import Modal from './Modal.jsx'

const fields = [['kcal', 'kcal'], ['carbs', 'Hidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']]

export default function MealAi({ meal, onReady, onClose }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [totals, setTotals] = useState({})
  const [grams, setGrams] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const estimate = async event => {
    event.preventDefault()
    if (loading || query.trim().length < 2) return
    setLoading(true); setError(''); setResult(null)
    try {
      const proposal = await api('/api/foods/ai', { method: 'POST', body: JSON.stringify({ query, mode: 'meal' }) })
      setResult(proposal); setGrams(proposal.food.servingSize)
      setTotals(Object.fromEntries(Object.entries(scaleNutrients(proposal.food.nutrients, proposal.food.servingSize)).map(([key, value]) => [key, Math.round(value * 10) / 10])))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  const review = () => {
    try { onReady(foodFromMealTotals(result.food, totals, grams)) } catch (err) { setError(err.message) }
  }
  return <Modal title={`Estimar ${meal.toLowerCase()} con IA`} onClose={onClose}
    primary={result && <button className="modal-primary" type="button" onClick={review}>Revisar y añadir</button>}>
    <form className="form" onSubmit={estimate}>
      <label>Qué has comido<textarea {...plainField('meal_description')} rows={4} maxLength={1000} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej. En un restaurante chino: un bol de arroz tres delicias, pollo con almendras y una cerveza. Una ración de cada." /></label>
      <button className="ai-action" type="submit" disabled={loading || query.trim().length < 2}>{loading ? 'Estimando…' : 'Estimar con IA'}</button>
      <p className="muted">Describe platos, bebidas, salsas y cantidades. La estimación puede variar mucho según la preparación; no sustituye una etiqueta.</p>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <section className="form ai-result" aria-live="polite">
      <h3>Estimación orientativa · comida completa</h3>
      <label>Alimento<input {...plainField('estimated_meal_name')} value={result.food.name} onChange={event => setResult(current => ({ ...current, food: { ...current.food, name: event.target.value } }))} /></label>
      <p className="muted">{result.notes}</p>
      <fieldset><legend>Totales de lo descrito, no por 100 g</legend><div className="macro-inputs">{fields.map(([key, label]) => <label key={key}>{label}<input {...numberField(`meal_total_${key}`)} type="number" min="0" step="0.1" value={totals[key]} onChange={event => setTotals(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div></fieldset>
      <label>Peso orientativo de la comida (g)<input {...numberField('meal_estimated_weight')} type="number" min="1" step="0.1" value={grams} onChange={event => setGrams(event.target.value)} /></label>
      <p className="muted">Puedes editar los totales. El peso sirve para registrar la ración; cambiarlo aquí no cambia las kcal totales.</p>
      {result.sources?.length > 0 && <ul className="ai-sources">{result.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}
    </section>}
  </Modal>
}
