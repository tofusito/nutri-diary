import { localDate } from '../lib/nutrition.js'

export default function DateControl({ date, onChange }) {
  const shift = (days) => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); onChange(localDate(next)) }
  const today = localDate()
  return <div className="date-control"><button aria-label="Día anterior" onClick={() => shift(-1)}>‹</button><input aria-label="Fecha" type="date" value={date} onChange={e => onChange(e.target.value)} /><button aria-label="Día siguiente" onClick={() => shift(1)}>›</button><button className="today" onClick={() => onChange(today)} disabled={date === today}>Hoy</button></div>
}
