import { useState } from 'react'
import { emptyFood, number } from '../lib/nutrition.js'
import { recognizeLabel } from '../lib/ocr.js'
import QrCode from './QrCode.jsx'

const fields = [['kcal', 'kcal'], ['carbs', 'Carbohidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']]
export default function FoodForm({ initial, onSave, onCancel }) {
  const [food, setFood] = useState(initial || emptyFood()); const [ocr, setOcr] = useState(''); const [loading, setLoading] = useState(false)
  const set = (key, value) => setFood(previous => ({ ...previous, [key]: value }))
  const nutrient = (key, value) => setFood(previous => ({ ...previous, nutrients: { ...previous.nutrients, [key]: number(value) } }))
  const scanLabel = async (file) => {
    if (!file) return; setLoading(true)
    try { const result = await recognizeLabel(file); setOcr(result.text); setFood(previous => ({ ...previous, nutrients: { ...previous.nutrients, ...result.nutrients } })) } catch { setOcr('No se pudo leer la etiqueta. Completa los campos manualmente.') } finally { setLoading(false) }
  }
  const submit = e => { e.preventDefault(); if (!food.name.trim()) return; onSave({ ...food, name: food.name.trim(), nutrients: Object.fromEntries(Object.entries(food.nutrients).map(([key, value]) => [key, number(value)])) }) }
  return <form className="form" onSubmit={submit}><label>Nombre<input required value={food.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Yogur griego natural" /></label><div className="two-col"><label>Marca<input value={food.brand || ''} onChange={e => set('brand', e.target.value)} /></label><label>Código de barras<input inputMode="numeric" value={food.barcode || ''} onChange={e => set('barcode', e.target.value)} /></label></div><fieldset><legend>Por 100 {food.basis === 'ml' ? 'ml' : 'g'}</legend><div className="macro-inputs">{fields.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="0.1" value={food.nutrients[key] ?? ''} onChange={e => nutrient(key, e.target.value)} /></label>)}</div></fieldset><div className="two-col"><label>Base<select value={food.basis} onChange={e => set('basis', e.target.value)}><option value="g">gramos</option><option value="ml">mililitros</option></select></label><label>Ración habitual<input type="number" min="0" step="1" value={food.servingSize || ''} onChange={e => set('servingSize', number(e.target.value))} /></label></div><label className="check"><input type="checkbox" checked={Boolean(food.favorite)} onChange={e => set('favorite', e.target.checked)} /> Favorito</label><label className="upload">{loading ? 'Leyendo etiqueta…' : 'Leer etiqueta nutricional'}<input type="file" accept="image/*" capture="environment" onChange={e => scanLabel(e.target.files?.[0])} /></label>{ocr && <details><summary>Texto OCR para confirmar</summary><pre>{ocr}</pre></details>}{food.id && <div className="qr-row"><QrCode foodId={food.id} /><span className="muted">QR privado: solo identifica este alimento en tu diario.</span></div>}<footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="submit">Guardar alimento</button></footer></form>
}
