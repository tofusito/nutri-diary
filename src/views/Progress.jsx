import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { localDate, nutrientText } from '../lib/nutrition.js'
import Macros from '../components/Macros.jsx'

const shortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
const ranges = [['7 días', 6], ['30 días', 29], ['90 días', 89]]

export default function Progress({ scope = '' }) {
  const [days, setDays] = useState(6)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const from = new Date(); from.setDate(from.getDate() - days)
    setLoading(true)
    api(`/api/progress?from=${localDate(from)}&to=${localDate()}${scope ? `&${scope}` : ''}`)
      .then(result => { if (alive) { setRows(result); setError('') } })
      .catch(err => { if (alive) setError(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [scope, days])

  // Days without a single entry say nothing about a trend, so they are dropped.
  const logged = rows.filter(row => row.count > 0)
  const max = Math.max(1, ...logged.map(row => Math.max(row.kcal || 0, row.goal?.kcal || 0)))
  const average = logged.length ? Math.round(logged.reduce((total, row) => total + (row.kcal || 0), 0) / logged.length) : null

  return <main>
    <div className="page-heading"><div><p className="eyebrow">TENDENCIA</p><h1>Progreso</h1></div></div>

    <div className="profile-switch">{ranges.map(([label, value]) =>
      <button key={value} className={`chip ${days === value ? 'on' : ''}`} onClick={() => setDays(value)}>{label}</button>)}</div>

    {error && <p className="error">{error}</p>}

    {loading ? <p className="muted">Cargando…</p> : !logged.length
      ? <section className="chart-card"><p className="empty">Todavía no has registrado ningún día en este periodo. En cuanto anotes algo aparecerá aquí.</p></section>
      : <>
        <section className="chart-card">
          <h2>{logged.length} día{logged.length > 1 ? 's' : ''} registrado{logged.length > 1 ? 's' : ''}</h2>
          <p className="muted">Media de {nutrientText(average)} kcal. Solo se muestran los días con registros.</p>
          <div className="bar-chart">{logged.slice(-14).map(row => {
            const over = row.goal?.kcal && row.kcal > row.goal.kcal
            return <div className="bar-day" key={row.date}>
              <div className="bar-track">
                {row.goal?.kcal ? <span className="bar-goal" style={{ bottom: `${Math.min(100, row.goal.kcal / max * 100)}%` }} /> : null}
                <i style={{ height: `${(row.kcal || 0) / max * 100}%`, background: over ? 'var(--over)' : 'var(--kcal)' }} />
              </div>
              <strong>{Math.round(row.kcal || 0)}</strong>
              <span>{shortDate(row.date)}</span>
            </div>
          })}</div>
        </section>

        <div className="food-list">{[...logged].reverse().map(row => {
          const left = row.goal?.kcal ? Math.round((row.kcal || 0) - row.goal.kcal) : null
          return <article className="food-card day-row" key={row.date}>
            <div>
              <strong>{shortDate(row.date)}</strong>
              <span>{nutrientText(row.kcal)} kcal <Macros nutrients={row} /></span>
            </div>
            {left !== null && <b className={`left ${left > 0 ? 'over' : 'under'}`}>{left > 0 ? '+' : '−'}{Math.abs(left)}</b>}
          </article>
        })}</div>
      </>}

    <section className="insight"><h2>Consistencia, no perfección</h2>
      <p>Tu objetivo diario sirve de referencia. Aquí no hay ajustes adaptativos automáticos.</p></section>
  </main>
}
