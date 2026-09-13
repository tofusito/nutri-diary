export function parseNutritionLabel(text) {
  const value = (patterns) => {
    const match = patterns.map((pattern) => text.match(pattern)).find(Boolean)
    return match ? Number(match[1].replace(',', '.')) : null
  }
  return {
    kcal: value([/(?:energ[íi]a|energy)[\s\S]{0,32}?(\d+(?:[,.]\d+)?)\s*kcal/i, /(\d+(?:[,.]\d+)?)\s*kcal/i]),
    carbs: value([/(?:hidratos|carbohydrates?|carbs?)[\s\S]{0,30}?(\d+(?:[,.]\d+)?)/i]),
    protein: value([/(?:prote[ií]nas?|protein)[\s\S]{0,30}?(\d+(?:[,.]\d+)?)/i]),
    fat: value([/(?:grasas?|fat)[\s\S]{0,30}?(\d+(?:[,.]\d+)?)/i])
  }
}

export async function recognizeLabel(file) {
  const { recognize } = await import('tesseract.js')
  const result = await recognize(file, 'eng+spa')
  return { text: result.data.text, nutrients: parseNutritionLabel(result.data.text) }
}
