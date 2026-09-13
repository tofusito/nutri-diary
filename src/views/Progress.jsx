import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { localDate, nutrientText } from '../lib/nutrition.js'

export default function Progress() {
  const today = localDate(); const earlier = new Date(); earlier.setDate(earlier.getDate() - 6)
  const [rows, setRows] = useState([]); const [error, setError] = useState(''); const [from, setFrom] = useState(localDate(earlier)); const [to, setTo] = useState(today)
  const load = () => api(`/api/progress?from=${from}&to=${to}`).then(setRows).catch(e => setError(e.message))
  useEffect(load, [])
  const max = Math.max(1, ...rows.map(row => Math.max(row.kcal || 0, row.goal?.kcal || 0)))
  return <main><div className="page-heading"><div><p className="eyebrow">TENDENCIA</p><h1>Progreso</h1></div></div><div className="two-col"><label>Desde<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div><button className="secondary" onClick={load}>Ver rango</button>{error && <p className="error">{error}</p>}<section className="chart-card"><h2>Rango elegido</h2>{rows.length ? <div className="bar-chart">{rows.map(row => <div className="bar-day" key={row.date}><div className="bar-track"><i style={{ height: `${(row.kcal || 0) / max * 100}%` }} /></div><strong>{nutrientText(row.kcal)}</strong><span>{new Date(`${row.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span></div>)}</div> : <p className="empty">Registra algunos días para ver tu tendencia.</p>}</section><div className="food-list">{rows.map(row => <article className="food-card" key={row.date}><div><strong>{row.date}</strong><span>{nutrientText(row.kcal)} kcal · C {nutrientText(row.carbs)} · P {nutrientText(row.protein)} · G {nutrientText(row.fat)}</span></div></article>)}</div><section className="insight"><h2>Consistencia, no perfección</h2><p>Tu objetivo diario sirve de referencia. Aquí no hay ajustes adaptativos automáticos.</p></section></main>
}
