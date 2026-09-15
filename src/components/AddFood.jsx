import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { nutrientText, emptyFood, scaleNutrients, selectZero } from '../lib/nutrition.js'
import Icon from './Icon.jsx'
import Macros from './Macros.jsx'
import Modal from './Modal.jsx'
import Scanner from './Scanner.jsx'
import FoodForm from './FoodForm.jsx'

const sameFood = (a, b) => a.barcode && b.barcode ? a.barcode === b.barcode && a.name === b.name : a.name === b.name && (a.brand || '') === (b.brand || '')
const hasKcal = food => Number.isFinite(food?.nutrients?.kcal)
const searchableText = food => [food.name, food.brand || '', food.barcode || ''].join(' ').toLowerCase()
const NOTIFICATION_DURATION_MS = 5_000

/** Search sheet used to log a food: always looks in the personal catalog first,
 *  then in Open Food Facts. A barcode can belong to several products, so every
 *  match is listed instead of silently taking the first one. */
export default function AddFood({ meal, entries, foods, profile, profiles, onAdd, onCreated, onClose }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({ mine: [], external: [] })
  const [barcode, setBarcode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [scanner, setScanner] = useState(false)
  const [chosen, setChosen] = useState(null)
  const [creating, setCreating] = useState(null)
  const [quantity, setQuantity] = useState(100)
  const [alsoFor, setAlsoFor] = useState({})
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState([])
  const [quickAdding, setQuickAdding] = useState('')
  const [notice, setNotice] = useState('')
  const validQuantity = value => Number.isFinite(Number(value)) && Number(value) > 0
  const request = useRef(0)
  const entryIds = useRef({})
  const noticeTimer = useRef()

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const local = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const byFavorite = (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))
    const usable = foods.filter(hasKcal)
    if (!needle) return [...usable].sort(byFavorite).slice(0, 12)
    return usable.filter(food => searchableText(food).includes(needle)).sort(byFavorite).slice(0, 25)
  }, [foods, query])
  const addedFoodIds = useMemo(() => new Set((entries || [])
    .filter(entry => entry.meal === meal && entry.food?.id)
    .map(entry => entry.food.id)), [entries, meal])

  useEffect(() => {
    const text = query.trim()
    const ticket = ++request.current
    setResult({ mine: [], external: [] }); setLoading(false); setMessage(''); setNotice('')
    if (text.length < 2) { setBarcode(''); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(text)}`)
        if (ticket === request.current) { setResult(data); setBarcode(/^[0-9]{6,14}$/.test(text) ? text : ''); setMessage(data.externalError || '') }
      } catch (error) { if (ticket === request.current) setMessage(error.message) } finally { if (ticket === request.current) setLoading(false) }
    }, 450)
    return () => { clearTimeout(timer); request.current++ }
  }, [query])

  // What this profile uses most often for this meal: the common case is
  // repeating a usual breakfast, not searching for it again.
  useEffect(() => {
    if (!profile?.id) return
    let alive = true
    api(`/api/entries/recent?meal=${encodeURIComponent(meal)}&profile=${profile.id}`)
      .then(rows => { if (alive) setRecent(rows.filter(row => hasKcal(row.food))) })
      .catch(() => { if (alive) setRecent([]) })
    return () => { alive = false }
  }, [meal, profile?.id])

  const repeat = row => { entryIds.current = {}; setChosen(row.food); setQuantity(row.quantity || row.food.servingSize || 100) }

  const quickAdd = async row => {
    if (quickAdding || addedFoodIds.has(row.food.id) || !profile?.id || !validQuantity(row.quantity)) return
    const foodId = row.food.id
    setQuickAdding(foodId); setMessage(''); setNotice('')
    try {
      await onAdd({
        food: row.food,
        meal,
        targets: [{ id: profile.id, quantity: Number(row.quantity) }],
        entryIds: { [profile.id]: crypto.randomUUID() },
      })
      setNotice(`${row.food.name} añadido · ${row.quantity} ${row.food.basis}`)
      clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setNotice(''), NOTIFICATION_DURATION_MS)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setQuickAdding('')
    }
  }

  const scan = async code => {
    setScanner(false); setQuery(code); setLoading(true); setMessage('')
    const ticket = ++request.current
    try {
      const data = await api(`/api/lookup/${encodeURIComponent(code)}`)
      if (ticket !== request.current) return
      setResult(data); setBarcode(code); setMessage(data.externalError || '')
      if (!data.mine.length && !data.external.length) setMessage('Ese código no está ni en tu biblioteca ni en Open Food Facts. Créalo a mano.')
    } catch (error) { if (ticket === request.current) setMessage(error.message) } finally { if (ticket === request.current) setLoading(false) }
  }

  const choose = food => { entryIds.current = {}; setChosen(food); setQuantity(food.servingSize || 100) }

  const confirm = async () => {
    if (saving) return
    if (!chosen || !validQuantity(quantity) || !Object.values(alsoFor).every(validQuantity)) return setMessage('Introduce una cantidad mayor que cero para cada persona.')
    setSaving(true); setMessage('')
    let food = chosen
    try {
      if (!foods.some(item => item.id === chosen.id)) {
        food = await api('/api/foods', { method: 'POST', body: JSON.stringify(chosen) })
        onCreated(food)
        setChosen(food)
      }
      const targets = [{ id: profile.id, quantity: Number(quantity) }]
      for (const [id, grams] of Object.entries(alsoFor)) if (Number(grams) > 0) targets.push({ id, quantity: Number(grams) })
      const ids = Object.fromEntries(targets.map(target => [target.id, entryIds.current[target.id] || (entryIds.current[target.id] = crypto.randomUUID())]))
      await onAdd({ food, meal, targets, entryIds: ids })
      onClose()
    } catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }

  const mine = useMemo(() => {
    const seen = new Set(local.map(food => food.id))
    return [...local, ...(result.mine || []).filter(food => hasKcal(food) && !seen.has(food.id))]
  }, [local, result])
  const external = useMemo(() => (result.external || []).filter(item => hasKcal(item) && !mine.some(food => sameFood(food, item))), [result, mine])

  if (creating) return <Modal title="Nuevo alimento" onClose={() => setCreating(null)}>
    <FoodForm initial={creating} onCancel={() => setCreating(null)} onSave={async food => {
      try { const saved = await api('/api/foods', { method: 'POST', body: JSON.stringify(food) }); onCreated(saved); setCreating(null); choose(saved) }
      catch (error) { throw error }
    }} />
  </Modal>

  const others = (profiles || []).filter(item => item.id !== profile?.id)
  const portion = chosen ? scaleNutrients(chosen.nutrients, validQuantity(quantity) ? Number(quantity) : 0) : null
  if (chosen) return <Modal title={`Añadir a ${meal}`} onClose={() => setChosen(null)}>
    <div className="chosen"><strong>{chosen.name}</strong><span>{[chosen.brand, chosen.quantityText, sourceLabel(chosen)].filter(Boolean).join(' · ')}</span>
      <div className="food-macros">por 100 {chosen.basis} · {nutrientText(chosen.nutrients.kcal)} kcal <Macros nutrients={chosen.nutrients} /></div>
    </div>
    <div className="quantity-row"><button className="secondary" onClick={() => setQuantity(q => Math.max(1, Number(q) - 10))}>−10</button>
      <input type="number" min="1" inputMode="numeric" value={quantity} onFocus={selectZero} onChange={e => setQuantity(e.target.value)} aria-label="Cantidad" />
      <span>{chosen.basis}</span><button className="secondary" onClick={() => setQuantity(q => Number(q) + 10)}>+10</button></div>
    <div className="portion-row">{[30, 50, 100, 150, 200, 250].map(size => <button key={size} className="chip" onClick={() => setQuantity(size)}>{size}</button>)}</div>
    <div className="chosen-total">
      <span>En {Number(quantity) || 0} {chosen.basis}</span>
      <b>{nutrientText(portion.kcal)} kcal</b>
      <small><Macros nutrients={portion} unit=" g" /></small>
    </div>
    {others.length > 0 && <div className="also-for">
      <p className="also-title">¿Habéis comido lo mismo?</p>
      {others.map(item => {
        const grams = alsoFor[item.id]
        return <div className="also-row" key={item.id}>
          <label className="check">
            <input type="checkbox" checked={grams !== undefined}
              onChange={event => setAlsoFor(current => {
                if (!event.target.checked) { const { [item.id]: removed, ...rest } = current; return rest }
                return { ...current, [item.id]: quantity }
              })} /> {item.name}
          </label>
          {grams !== undefined && <span className="also-amount">
            <input type="number" min="1" inputMode="numeric" onFocus={selectZero} aria-label={`Cantidad para ${item.name}`}
              value={grams} onChange={event => setAlsoFor(current => ({ ...current, [item.id]: event.target.value }))} />
            {chosen.basis}
            <small>{nutrientText(scaleNutrients(chosen.nutrients, validQuantity(grams) ? Number(grams) : 0).kcal)} kcal</small>
          </span>}
        </div>
      })}
    </div>}
    {message && <p className="error">{message}</p>}
    <footer className="form-actions"><button className="secondary" onClick={() => setChosen(null)}>Volver</button>
      <button disabled={saving} onClick={confirm}>{saving ? 'Guardando…' : `Añadir${Object.keys(alsoFor).length ? ` a ${Object.keys(alsoFor).length + 1}` : ''}`}</button></footer>
  </Modal>

  const createByHand = () => setCreating({ ...emptyFood(), name: query.trim().length > 2 && !barcode ? query.trim() : '', barcode })
  return <Modal title={`Añadir a ${meal}`} onClose={onClose} tall
    action={<button type="button" className="chip" onClick={createByHand}>+ A mano</button>}>
    <div className="search-row">
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar o escribir un código" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck="false" />
      <button className="secondary scan-button" onClick={() => setScanner(true)} aria-label="Escanear código de barras"><Icon name="barcode" /></button>
    </div>
    {barcode && barcode === query.trim() && !loading && <p className="barcode-note">Código <b>{barcode}</b> · {mine.length + external.length
      ? `${mine.length + external.length} producto(s). Un mismo código puede estar reutilizado en varios productos: revísalo antes de elegir.`
      : 'sin resultados. Créalo con «+ A mano» arriba: el código ya va rellenado.'}</p>}
    {loading && <p className="muted">Buscando…</p>}
    {message && <p className="error" role="alert">{message}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
    <div className="results">
      {!query.trim() ? <>
        <h3>{recent.length ? `Tus habituales de ${meal.toLowerCase()}` : 'Tu biblioteca'}</h3>
        {recent.length ? recent.map(row => <FrequentRow key={row.food.id} row={row}
          onPick={() => repeat(row)} onQuickAdd={() => quickAdd(row)}
          adding={quickAdding === row.food.id} added={addedFoodIds.has(row.food.id)} />)
          : mine.length ? mine.map(food => <Row key={food.id} food={food} onPick={() => choose(food)} />)
            : <p className="empty">Nada en tu biblioteca todavía.</p>}
      </> : <>
        <h3>Tuyos <small>{mine.length}</small></h3>
        {mine.length ? mine.map(food => <Row key={food.id} food={food} onPick={() => choose(food)} />) : <p className="empty">Nada en tu biblioteca todavía.</p>}
        <h3>Open Food Facts <small>{external.length}</small></h3>
        {external.length ? external.map(food => <Row key={food.id} food={food} onPick={() => choose(food)} external />) : <p className="empty">{query.trim().length < 2 ? 'Escribe para buscar en la base pública.' : loading ? '…' : result.external?.some(item => hasKcal(item)) ? 'Lo público que hay aquí ya está en tu biblioteca.' : result.external?.length ? 'Hay resultados sin kcal declaradas; no se muestran.' : 'Sin resultados públicos.'}</p>}
      </>}
    </div>
    {scanner && <Scanner onResult={scan} onClose={() => setScanner(false)} />}
  </Modal>
}

const sourceLabel = food => food.source === 'openfoodfacts' ? 'Open Food Facts' : ''

function FrequentRow({ row, onPick, onQuickAdd, adding, added }) {
  const food = row.food
  const portion = scaleNutrients(food.nutrients, row.quantity)
  return <div className={`result quick-result ${added ? 'is-added' : ''}`}>
    <button type="button" className="result-main" onClick={onPick}>
      {food.image ? <img src={food.image} alt="" loading="lazy" /> : <span className="result-dot star">↺</span>}
      <span className="result-body"><strong>{food.name}</strong>
        <small>{row.quantity} {food.basis} · {nutrientText(portion.kcal)} kcal</small>
        <small className="result-macros"><Macros nutrients={portion} /></small>
      </span>
    </button>
    <button type="button" className={`quick-add ${added ? 'added' : ''}`} onClick={onQuickAdd} disabled={adding || added}
      aria-label={`${added ? 'Ya añadido' : 'Añadir'} ${food.name}, ${row.quantity} ${food.basis}`}>{adding ? '…' : added ? '✓' : '+'}</button>
  </div>
}

function Row({ food, onPick, external }) {
  return <button type="button" className="result" onClick={onPick}>
    {food.image ? <img src={food.image} alt="" loading="lazy" /> : <span className={`result-dot ${food.favorite ? 'star' : ''}`}>{external ? '⌾' : food.favorite ? '★' : '◍'}</span>}
    <span className="result-body"><strong>{food.name}</strong>
      <small>{[food.brand, food.quantityText, food.barcode].filter(Boolean).join(' · ') || 'Sin marca'}</small>
      <small className="result-macros">{nutrientText(food.nutrients.kcal)} kcal <Macros nutrients={food.nutrients} /> <i>/100 {food.basis}</i></small>
    </span>
  </button>
}
