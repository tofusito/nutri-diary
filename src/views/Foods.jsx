import { useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { nutrientText } from '../lib/nutrition.js'
import Macros from '../components/Macros.jsx'
import Modal from '../components/Modal.jsx'
import FoodForm from '../components/FoodForm.jsx'
import Scanner from '../components/Scanner.jsx'
import RecipeBuilder from '../components/RecipeBuilder.jsx'

export default function Foods({ foods, onFoods }) {
  const [query, setQuery] = useState(''); const [editing, setEditing] = useState(null); const [recipe, setRecipe] = useState(false); const [scanner, setScanner] = useState(false); const [message, setMessage] = useState('')
  const visible = useMemo(() => foods.filter(food => `${food.name} ${food.brand || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)), [foods, query])
  const save = async food => { const exists = foods.some(item => item.id === food.id); const saved = await api(exists ? `/api/foods/${food.id}` : '/api/foods', { method: exists ? 'PATCH' : 'POST', body: JSON.stringify(food) }); onFoods(current => exists ? current.map(item => item.id === food.id ? saved : item) : [saved, ...current]); setEditing(null); setRecipe(false) }
  const blank = code => ({ id: crypto.randomUUID(), name: '', brand: '', barcode: code || '', basis: 'g', nutrients: { kcal: null, carbs: null, protein: null, fat: null } })
  const barcode = async code => { setScanner(false); try { const found = await api(`/api/lookup/${encodeURIComponent(code)}`); const match = found.mine?.[0] || found.external?.[0]; setEditing(match ? { ...match, barcode: code } : blank(code)) } catch { setEditing(blank(code)) } }
  return <main><div className="page-heading"><div><p className="eyebrow">BIBLIOTECA</p><h1>Alimentos</h1></div><button onClick={() => setEditing(blank(''))}>+ Nuevo</button></div><div className="search-row"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en tu biblioteca" /><button className="secondary" onClick={() => setRecipe(true)}>Receta</button><button className="secondary" onClick={() => setScanner(true)}>Escanear</button></div>{message && <p className="error">{message}</p>}<div className="food-list">{visible.map(food => <article key={food.id} className="food-card"><button onClick={() => setEditing(food)}><div><strong>{food.favorite && '★ '}{food.name}</strong><span>{food.recipe ? 'Receta' : food.brand || 'Manual'} · por 100 {food.basis}</span></div><b>{nutrientText(food.nutrients.kcal)}<small> kcal</small></b><div className="food-macros"><Macros nutrients={food.nutrients} /></div></button></article>)}{!visible.length && <p className="empty">No hay alimentos que coincidan.</p>}</div>{editing && <Modal title={foods.some(food => food.id === editing.id) ? 'Editar alimento' : 'Nuevo alimento'} onClose={() => setEditing(null)}><FoodForm initial={editing} onSave={save} onCancel={() => setEditing(null)} /></Modal>}{recipe && <Modal title="Nueva receta" onClose={() => setRecipe(false)}><RecipeBuilder foods={foods} onSave={save} onCancel={() => setRecipe(false)} /></Modal>}{scanner && <Scanner onResult={barcode} onClose={() => setScanner(false)} />}</main>
}
