export { macroCalories, scaleNutrients, sumNutrients, estimateEnergy, localDate, validDate } from '../../shared/nutrition.js'

export const emptyFood = () => ({ id: crypto.randomUUID(), name: '', brand: '', barcode: '', basis: 'g', nutrients: { kcal: 0, carbs: 0, protein: 0, fat: 0 } })
export const number = (value) => value === '' || value === null ? null : Number(value)
export const nutrientText = (value) => value == null ? '—' : Number(value).toLocaleString('es-ES', { maximumFractionDigits: 1 })
