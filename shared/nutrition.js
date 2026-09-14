export const nutrientKeys = ['kcal', 'carbs', 'protein', 'fat'];
export const meals = ['Desayuno', 'Comida', 'Merienda', 'Cena', 'Snacks'];

function nonnegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label}: valor no válido`);
  return value;
}

export function macroCalories({ carbs, protein, fat }) {
  return 4 * nonnegative(carbs, 'Hidratos') + 4 * nonnegative(protein, 'Proteínas') + 9 * nonnegative(fat, 'Grasas');
}

export function scaleNutrients(nutrients, quantity) {
  nonnegative(quantity, 'Cantidad');
  return Object.fromEntries(nutrientKeys.map(key => [key,
    nutrients[key] == null ? null : nonnegative(nutrients[key], key) * quantity / 100]));
}

export function sumNutrients(items) {
  return Object.fromEntries(nutrientKeys.map(key => [key,
    items.some(item => item[key] == null) ? null : items.reduce((total, item) => total + nonnegative(item[key], key), 0)]));
}

export function estimateEnergy({ weight, height, age, sex, activity }) {
  if (!Number.isFinite(weight) || weight < 20 || weight > 400 || !Number.isFinite(height) || height < 100 || height > 250 || !Number.isFinite(age) || age < 18 || age > 100) throw new Error('Introduce peso, altura y edad adulta válidos.');
  if (!['male', 'female'].includes(sex) || ![1.2, 1.375, 1.55, 1.725, 1.9].includes(activity)) throw new Error('Selecciona sexo de la ecuación y actividad.');
  const resting = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  return { resting: Math.round(resting), maintenance: Math.round(resting * activity) };
}

export function localDate(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) throw new Error('Fecha no válida');
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
}

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === value;
}
