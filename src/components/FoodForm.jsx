import { useId, useState } from 'react'
import { api } from '../lib/api.js'
import { emptyFood, number, selectZero } from '../lib/nutrition.js'
import { recognizeLabel } from '../lib/ocr.js'
import QrCode from './QrCode.jsx'
import Icon from './Icon.jsx'
import Scanner from './Scanner.jsx'
import Modal from './Modal.jsx'
import { plainField, numberField } from '../lib/fields.js'

const fields = [['kcal', 'kcal'], ['carbs', 'Hidratos'], ['protein', 'Proteínas'], ['fat', 'Grasas']]
const confidenceText = { high: 'alta', medium: 'media', low: 'baja' }

/** Minimal by default: name, barcode and the four values per 100 g/ml. Brand,
 *  portion, favorite, label OCR and the private QR stay behind "Más opciones".
 *  Whatever is saved here goes to the shared catalog every profile searches. */
export default function FoodForm({ title = 'Nuevo alimento', initial, onSave, onCancel, onDelete }) {
  const formId = useId()
  const [food, setFood] = useState(initial || emptyFood())
  const [ocr, setOcr] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [aiQuery, setAiQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState(null)
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
  const fillWithAi = async () => {
    const query = aiQuery.trim()
    if (query.length < 2 || aiLoading || saving || loading) return
    setAiLoading(true); setAiError(''); setError('')
    try {
      const result = await api('/api/foods/ai', { method: 'POST', body: JSON.stringify({ query, barcode: food.barcode || '', basis: food.basis }) })
      const proposed = result.food
      setFood(previous => ({
        ...previous,
        name: proposed.name || previous.name,
        brand: proposed.brand || previous.brand || '',
        barcode: previous.barcode || proposed.barcode || '',
        basis: proposed.basis || previous.basis,
        nutrients: proposed.nutrients,
        servingSize: proposed.servingSize ?? previous.servingSize ?? '',
        source: proposed.source,
        ai: proposed.ai,
      }))
      setAiResult(result)
    } catch (err) { setAiError(err.message) } finally { setAiLoading(false) }
  }
  const unit = food.basis === 'ml' ? 'ml' : 'g'

  const primary = <button type="submit" form={formId} className="modal-primary" disabled={saving || loading}>{saving ? 'Guardando…' : 'Guardar'}</button>

  return <>
  <Modal title={title} onClose={onCancel} primary={primary}>
  <form id={formId} className="form" onSubmit={submit} autoComplete="off">
    <section className="ai-assistant" aria-labelledby="food-ai-title">
      <div className="ai-assistant-head"><div><p className="eyebrow">ASISTENTE</p><h3 id="food-ai-title">Rellenar con IA</h3></div><span className="ai-badge">WEB</span></div>
      <label>Qué alimento o producto buscas<input {...plainField('ai_query')} type="search" value={aiQuery} onChange={event => setAiQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); fillWithAi() } }} placeholder="Ej. Pan de hamburguesa Hacendado" enterKeyHint="search" /></label>
      <button type="button" className="ai-action" onClick={fillWithAi} disabled={aiQuery.trim().length < 2 || aiLoading || saving || loading}>{aiLoading ? 'Buscando…' : 'Buscar con IA'}</button>
      <p className="muted">Consulta fuentes públicas y propone valores por 100 {unit}. Revísalos antes de guardar.</p>
      {aiError && <p className="error" role="alert">{aiError}</p>}
      {aiResult && <div className="ai-result" role="status" aria-live="polite">
        <div className="ai-result-head"><strong>Propuesta rellenada</strong><span className={`ai-confidence confidence-${aiResult.confidence}`}>Confianza {confidenceText[aiResult.confidence] || 'no indicada'}</span></div>
        {aiResult.notes && <p className="muted">{aiResult.notes}</p>}
        {aiResult.sources?.length > 0 && <div><small className="ai-sources-label">Fuentes consultadas</small><ul className="ai-sources">{aiResult.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></div>}
        <small className="muted">La propuesta queda editable. Guarda solo cuando te cuadre con la etiqueta.</small>
      </div>}
    </section>
    <label>Alimento<input {...plainField('food_title')} required value={food.name} onChange={event => set('name', event.target.value)} placeholder="Ej. Yogur griego natural" enterKeyHint="next" autoCapitalize="sentences" /></label>
    <label>Código de barras<span className="scan-field">
      <input {...numberField('ean', { inputMode: 'numeric', pattern: '[0-9]*' })} value={food.barcode || ''} onChange={event => set('barcode', event.target.value)} placeholder="Escanéalo o escríbelo" enterKeyHint="next" />
      <button type="button" className="secondary scan-button" onClick={() => setScanning(true)} aria-label="Escanear el código de barras"><Icon name="barcode" />Escanear</button>
    </span></label>
    <label>Se mide en<select {...plainField('basis')} value={food.basis} onChange={event => set('basis', event.target.value)}><option value="g">gramos</option><option value="ml">mililitros</option></select></label>
    <fieldset><legend>Por 100 {unit}</legend>
      <div className="macro-inputs">{fields.map(([key, label]) =>
        <label key={key}>{label}<input {...numberField(`per100_${key}`)} aria-label={label} type="number" min="0" step="0.1" value={food.nutrients[key] ?? ''} onFocus={selectZero} onChange={event => nutrient(key, event.target.value)} enterKeyHint="next" /></label>)}</div>
      <p className="muted">Copia los valores de la etiqueta. Deja en blanco lo que no venga: se guarda como desconocido, no como cero.</p>
    </fieldset>
    <p className="muted">Se guarda en la biblioteca común: lo verán todos los perfiles.</p>

    <details className="more">
      <summary>Más opciones</summary>
      <div className="two-col">
        <label>Marca<input {...plainField('maker')} value={food.brand || ''} onChange={event => set('brand', event.target.value)} enterKeyHint="next" /></label>
        <label>Ración habitual ({unit})<input {...numberField('portion')} type="number" min="0" step="1" value={food.servingSize || ''} onFocus={selectZero} onChange={event => set('servingSize', number(event.target.value))} enterKeyHint="done" /></label>
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
  </form>
  </Modal>
  {scanning && <Scanner onResult={code => { set('barcode', code); setScanning(false) }} onClose={() => setScanning(false)} />}
  </>
}
