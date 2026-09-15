import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { nutrientText } from '../lib/nutrition.js'
import Macros from '../components/Macros.jsx'
import Modal from '../components/Modal.jsx'
import FoodForm from '../components/FoodForm.jsx'
import Scanner from '../components/Scanner.jsx'
import RecipeBuilder from '../components/RecipeBuilder.jsx'

const blank = code => ({ id: crypto.randomUUID(), name: '', brand: '', barcode: code || '', basis: 'g', nutrients: { kcal: null, carbs: null, protein: null, fat: null } })
const byName = (a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name)

export default function Foods({ foods, onFoods }) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState(null)
  const [total, setTotal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [recipe, setRecipe] = useState(false)
  const [scanner, setScanner] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { api('/api/foods/count').then(result => setTotal(result.total)).catch(() => setTotal(null)) }, [foods.length])

  // The loaded list is one page of the catalogue, so once it outgrows that page
  // the search has to run on the server or older foods become unreachable.
  useEffect(() => {
    const needle = query.trim()
    if (needle.length < 2) { setRemote(null); return }
    let alive = true
    const timer = setTimeout(() => {
      api(`/api/foods?q=${encodeURIComponent(needle)}`)
        .then(rows => { if (alive) setRemote(rows) })
        .catch(error => { if (alive) { setRemote(null); setMessage(error.message) } })
    }, 350)
    return () => { alive = false; clearTimeout(timer) }
  }, [query])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const local = needle
      ? foods.filter(food => `${food.name} ${food.brand || ''} ${food.barcode || ''}`.toLowerCase().includes(needle))
      : foods
    if (!remote) return [...local].sort(byName)
    const seen = new Set(local.map(food => food.id))
    return [...local, ...remote.filter(food => !seen.has(food.id))].sort(byName)
  }, [foods, query, remote])

  const save = async food => {
    const exists = foods.some(item => item.id === food.id)
    const saved = await api(exists ? `/api/foods/${food.id}` : '/api/foods', { method: exists ? 'PATCH' : 'POST', body: JSON.stringify(food) })
    onFoods(current => exists ? current.map(item => item.id === food.id ? saved : item) : [saved, ...current])
    setRemote(current => current && current.map(item => item.id === saved.id ? saved : item))
    setEditing(null); setRecipe(false); setMessage('')
  }
  const remove = async food => {
    await api(`/api/foods/${food.id}`, { method: 'DELETE' })
    onFoods(current => current.filter(item => item.id !== food.id))
    setRemote(current => current && current.filter(item => item.id !== food.id))
    setEditing(null); setMessage('')
  }
  const barcode = async code => {
    setScanner(false)
    try {
      const found = await api(`/api/lookup/${encodeURIComponent(code)}`)
      const match = found.mine?.[0] || found.external?.[0]
      setEditing(match ? { ...match, barcode: code } : blank(code))
    } catch { setEditing(blank(code)) }
  }

  const stored = editing && foods.some(food => food.id === editing.id)
  const hidden = total !== null && !query.trim() && total > foods.length

  return <main>
    <div className="page-heading"><div><p className="eyebrow">BIBLIOTECA</p><h1>Alimentos</h1></div>
      <button onClick={() => setEditing(blank(''))}>+ Nuevo</button></div>

    <div className="search-row library-search">
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar en tu biblioteca" />
      <button className="secondary" onClick={() => setRecipe(true)}>Receta</button>
      <button className="secondary" onClick={() => setScanner(true)}>Escanear</button>
    </div>

    {hidden && <p className="muted">Mostrando {foods.length} de {total}. Busca por nombre, marca o código para llegar al resto.</p>}
    {message && <p className="error" role="alert">{message}</p>}

    <div className="food-list">
      {visible.map(food => <article key={food.id} className="food-card">
        <button onClick={() => setEditing(food)}>
          <div><strong>{food.favorite && '★ '}{food.name}</strong>
            <span>{food.recipe ? 'Receta' : food.brand || 'Manual'} · por 100 {food.basis}</span></div>
          <b>{nutrientText(food.nutrients.kcal)}<small> kcal</small></b>
          <div className="food-macros"><Macros nutrients={food.nutrients} /></div>
        </button>
      </article>)}
      {!visible.length && <p className="empty">No hay alimentos que coincidan.</p>}
    </div>

    {editing && <Modal title={stored ? 'Editar alimento' : 'Nuevo alimento'} onClose={() => setEditing(null)} className="form-sheet">
      <FoodForm initial={editing} onSave={save} onCancel={() => setEditing(null)}
        onDelete={stored ? () => remove(editing) : undefined} />
    </Modal>}
    {recipe && <Modal title="Nueva receta" onClose={() => setRecipe(false)} className="form-sheet">
      <RecipeBuilder foods={foods} onSave={save} onCancel={() => setRecipe(false)} /></Modal>}
    {scanner && <Scanner onResult={barcode} onClose={() => setScanner(false)} />}
  </main>
}
