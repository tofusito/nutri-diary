import { useMemo, useState } from 'react'
import { scaleNutrients, sumNutrients, safeMacroCalories, meals, nutrientText, remaining, remainingText } from '../lib/nutrition.js'
import AddFood from '../components/AddFood.jsx'
import Macros from '../components/Macros.jsx'
import { localDate } from '../lib/nutrition.js'

const longDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
const macros = [['kcal', 'Energía', '', 'kcal'], ['carbs', 'Hidratos', 'g', 'carbs'], ['protein', 'Proteínas', 'g', 'protein'], ['fat', 'Grasas', 'g', 'fat']]

/** Home screen: one day, five meals, and how far the day is from the goal. */
export default function Today({ date, setDate, entries, profile, profiles, foods, onAdd, onEdit, onDelete, onCopy, onFoods }) {
  const [adding, setAdding] = useState(null)
  const totals = useMemo(() => sumNutrients(entries.map(entry => scaleNutrients(entry.food.nutrients, entry.quantity))), [entries])
  const goal = { kcal: safeMacroCalories(profile), carbs: profile.carbs || 0, protein: profile.protein || 0, fat: profile.fat || 0 }
  const today = localDate()
  const shift = days => { const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + days); setDate(localDate(next)) }

  return <main>
    <div className="diary-brand"><img src="/noodle-192.png" alt="" />Nutri<span>{profile?.name}</span></div>
    <header className="day-head">
      <button className="ghost" onClick={() => shift(-1)} aria-label="Día anterior">‹</button>
      <div><p className="eyebrow">{date === today ? 'HOY' : 'DIARIO'}</p><h1>{longDate(date)}</h1></div>
      <button className="ghost" onClick={() => shift(1)} aria-label="Día siguiente" disabled={date >= today}>›</button>
    </header>
    {date !== today && <button className="link-button center" onClick={() => setDate(today)}>Volver a hoy</button>}

    <section className="totals" aria-label="Totales del día">
      {macros.map(([key, label, unit, tone]) => {
        const left = remaining(totals[key], goal[key])
        return <div className={`total tone-${tone}`} key={key}>
          <span className="total-label">{label}</span>
          <strong>{nutrientText(totals[key])}<small>/{nutrientText(goal[key])}{unit === 'g' ? 'g' : ''}</small></strong>
          <div className="total-bar"><i className={left > 0 ? 'over' : ''} style={{ width: `${totals[key] == null || !goal[key] ? 0 : Math.min(100, totals[key] / goal[key] * 100)}%` }} /></div>
          <span className={`left ${left == null ? 'none' : left > 0 ? 'over' : 'under'}`}>{left == null ? (goal[key] ? '—' : 'sin objetivo') : `${remainingText(left)}${unit === 'g' ? ' g' : ''}`}</span>
        </div>
      })}
    </section>

    <div className="meals">{meals.map(name => {
      const rows = entries.filter(entry => entry.meal === name)
      const mealTotals = sumNutrients(rows.map(entry => scaleNutrients(entry.food.nutrients, entry.quantity)))
      return <section className="meal" key={name}>
        <h2>{name}<span>{rows.length ? `${nutrientText(mealTotals.kcal)} kcal` : ''}</span>
          <button className="add-meal" onClick={() => setAdding(name)} aria-label={`Añadir a ${name}`}>+</button></h2>
        {rows.length > 0 && <p className="meal-macros"><Macros nutrients={mealTotals} unit=" g" /></p>}
        {rows.map(entry => {
          const portion = scaleNutrients(entry.food.nutrients, entry.quantity)
          return <article className={`entry ${entry.pending ? 'pending' : ''}`} key={entry.id}>
            <button className="entry-main" onClick={() => onEdit(entry)}>
              <strong>{entry.food.name}</strong>
              <span><b>{entry.quantity} {entry.food.basis}</b> · {nutrientText(portion.kcal)} kcal{entry.pending ? ' · pendiente' : ''}</span>
              <span className="entry-macros"><Macros nutrients={portion} /></span>
            </button>
            <button className="delete" onClick={() => onDelete(entry)} aria-label={`Eliminar ${entry.food.name}`}>×</button>
          </article>
        })}
        {!rows.length && <p className="empty">Nada todavía.</p>}
      </section>
    })}</div>

    <button className="link-button center" onClick={onCopy}>Copiar el día anterior</button>

    {adding && <AddFood meal={adding} foods={foods} profile={profile} profiles={profiles}
      onCreated={food => onFoods(current => [food, ...current.filter(item => item.id !== food.id)])}
      onAdd={onAdd} onClose={() => setAdding(null)} />}
  </main>
}
