import { nutrientKeys } from './nutrition.js';

/** Convert editable whole-meal totals into the diary's per-100-g storage. */
export function foodFromMealTotals(food, totals, grams) {
  if (typeof food.name !== 'string' || !food.name.trim()) throw new Error('Introduce un nombre para la comida.');
  const quantity = Number(grams);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Introduce un peso orientativo mayor que cero.');
  const nutrients = Object.fromEntries(nutrientKeys.map(key => {
    const value = totals[key];
    if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Completa las kcal y las macros con valores válidos.');
    return [key, Number(value) * 100 / quantity];
  }));
  return { ...food, name: food.name.trim(), basis: 'g', servingSize: quantity, nutrients, ai: { ...food.ai, estimated: true, confidence: 'low' } };
}
