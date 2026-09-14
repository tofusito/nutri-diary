export { meals, macroCalories, scaleNutrients, sumNutrients, estimateEnergy, localDate, validDate } from '../../shared/nutrition.js'
import { macroCalories as strictMacroCalories } from '../../shared/nutrition.js'

export const emptyFood = () => ({ id: crypto.randomUUID(), name: '', brand: '', barcode: '', basis: 'g', nutrients: { kcal: null, carbs: null, protein: null, fat: null } })
export const number = (value) => value === '' || value === null ? null : Number(value)
export const nutrientText = (value) => value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: 1 })
export const safeMacroCalories = (profile) => { try { return strictMacroCalories(profile) } catch { return null } }
export const selectZero = event => {
  const input = event.currentTarget
  if (input.value !== '0') return
  input.select()
  requestAnimationFrame(() => { if (document.activeElement === input && input.value === '0') input.select() })
}

/** Consumed minus goal: negative means still available, positive means over. */
export const remaining = (value, goal) => value == null || !goal ? null : Math.round(value - goal)
export const remainingText = (value) => value == null ? '' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`
