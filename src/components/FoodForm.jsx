import { useState } from 'react'
import { emptyFood, number, selectZero } from '../lib/nutrition.js'
import { recognizeLabel } from '../lib/ocr.js'
import QrCode from './QrCode.jsx'

const fields = [['kcal', 'kcal'], ['carbs', 'Hidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']]

/** Minimal by default: name, barcode and the four values per 100 g/ml. Brand,
 *  portion, favorite, label OCR and the private QR stay behind "Más opciones".
 *  Whatever is saved here goes to the shared catalog every profile searches. */
export default function FoodForm({ initial, onSave, onCancel, onDelete }) {
  const [food, setFood] = useState(initial || emptyFood())
  const [ocr, setOcr] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setFood(previous => ({ ...previous, [key]: value }))
  const nutrient = (key, value) => setFood(previous => ({ ...previous, nutrients: { ...previous.nutrients, [key]: number(value) } }))
  const scanLabel = async file => {
    if (!file) return
    setLoading(true)
    try { const result = await recognizeLabel(file); setOcr(result.text); setFood(previous => ({ ...previous, nutrients: { ...previous.nutrients, ...result.nutrients } })) }
    catch { setOcr('No se pudo leer la etiqueta. Completa los campos a mano.') } finally { setLoading(false) }
  }
  const submit = async event => {
    event.preventDefault()
    if (!food.name.trim()) return
    if (saving || loading) return
    setSaving(true); setError('')
    try { await onSave({ ...food, name: food.name.trim(), nutrients: Object.fromEntries(Object.entries(food.nutrients).map(([key, value]) => [key, number(value)])) }) }
    catch (err) { setError(err.message || 'No se pudo guardar. Inténtalo otra vez.') }
    finally { setSaving(false) }
  }
  const unit = food.basis === 'ml' ? 'ml' : 'g'

  return <form className="form" onSubmit={submit}>
    <label>Nombre<input required autoFocus={!food.name} value={food.name} onChange={event => set('name', event.target.value)} placeholder="Ej. Yogur griego natural" /></label>
    <div className="two-col">
      <label>Código de barras<input inputMode="numeric" value={food.barcode || ''} onChange={event => set('barcode', event.target.value)} placeholder="Opcional" /></label>
      <label>Se mide en<select value={food.basis} onChange={event => set('basis', event.target.value)}><option value="g">gramos</option><option value="ml">mililitros</option></select></label>
    </div>
    <fieldset><legend>Por 100 {unit}</legend>
      <div className="macro-inputs">{fields.map(([key, label]) =>
        <label key={key}>{label}<input aria-label={label} type="number" min="0" step="0.1" inputMode="decimal" value={food.nutrients[key] ?? ''} onFocus={selectZero} onChange={event => nutrient(key, event.target.value)} /></label>)}</div>
      <p className="muted">Copia los valores de la etiqueta. Deja en blanco lo que no venga: se guarda como desconocido, no como cero.</p>
    </fieldset>
    <p className="muted">Se guarda en la biblioteca común: lo verán todos los perfiles.</p>

    <details className="more">
      <summary>Más opciones</summary>
      <div className="two-col">
        <label>Marca<input value={food.brand || ''} onChange={event => set('brand', event.target.value)} /></label>
        <label>Ración habitual ({unit})<input type="number" min="0" step="1" value={food.servingSize || ''} onFocus={selectZero} onChange={event => set('servingSize', number(event.target.value))} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={Boolean(food.favorite)} onChange={event => set('favorite', event.target.checked)} /> Favorito</label>
      <label className="upload">{loading ? 'Leyendo etiqueta…' : 'Leer etiqueta con la cámara'}<input type="file" accept="image/*" capture="environment" onChange={event => scanLabel(event.target.files?.[0])} /></label>
      {ocr && <details><summary>Texto leído, para confirmar</summary><pre>{ocr}</pre></details>}
      {food.id && <div className="qr-row"><QrCode foodId={food.id} /><span className="muted">QR privado: solo identifica este alimento en tu diario.</span></div>}
    </details>

    {onDelete && (confirming
      ? <div className="confirm-row">
          <span>¿Eliminar «{food.name}» de la biblioteca? Lo ya registrado en los diarios se conserva.</span>
          <button type="button" className="secondary" onClick={() => setConfirming(false)}>No</button>
          <button type="button" className="danger" disabled={saving} onClick={async () => {
            setSaving(true)
            try { await onDelete() } catch (err) { setError(err.message || 'No se pudo eliminar.'); setSaving(false); setConfirming(false) }
          }}>Sí, eliminar</button>
        </div>
      : <button type="button" className="link-button danger" onClick={() => setConfirming(true)}>Eliminar de la biblioteca</button>)}

    {error && <p className="error" role="alert">{error}</p>}
    <footer className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="submit" disabled={saving || loading}>{saving ? 'Guardando…' : 'Guardar alimento'}</button></footer>
  </form>
}
