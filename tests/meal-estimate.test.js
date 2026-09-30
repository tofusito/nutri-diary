import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFoodAi, normalizeFoodAiRequest } from '../server/food-ai.js';
import { foodFromMealTotals } from '../shared/meal-estimate.js';
import { scaleNutrients } from '../shared/nutrition.js';

const proposal = { name: 'Arroz con pollo', brand: '', basis: 'g', nutrients: { kcal: 150, carbs: 20, protein: 10, fat: 3 }, servingSize: 500, estimated: true, confidence: 'high', notes: 'Peso y aceite estimados.', sources: [] };

test('whole meal totals round-trip without changing when assumed weight changes', () => {
  const totals = { kcal: 750, carbs: 100, protein: 50, fat: 15 };
  for (const weight of [250, 500, 900]) {
    const food = foodFromMealTotals(proposal, totals, weight);
    assert.deepEqual(scaleNutrients(food.nutrients, weight), totals);
    assert.equal(food.ai.estimated, true);
  }
  for (const invalid of ['', 0, -1, Infinity]) assert.throws(() => foodFromMealTotals(proposal, totals, invalid));
  assert.throws(() => foodFromMealTotals(proposal, { ...totals, protein: '' }, 500));
});

test('meal descriptions have a bounded longer limit than product lookups', () => {
  assert.equal(normalizeFoodAiRequest({ query: 'x'.repeat(1000), mode: 'meal' }).mode, 'meal');
  assert.throws(() => normalizeFoodAiRequest({ query: 'x'.repeat(1001), mode: 'meal' }));
  assert.throws(() => normalizeFoodAiRequest({ query: 'x'.repeat(181) }));
});

test('AI estimates never claim high confidence or invented sources', async () => {
  let call;
  const assistant = createFoodAi({ client: { responses: { create: async options => {
    call = options;
    return { status: 'completed', output: [], output_text: JSON.stringify({ ...proposal, sources: [{ title: 'Invented', url: 'https://example.com' }] }) };
  } } } });
  const result = await assistant.enrich(normalizeFoodAiRequest({ mode: 'meal', query: 'Arroz con pollo y salsa' }));
  assert.equal(result.model, 'gpt-6-luna');
  assert.equal(result.estimated, true);
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.sources, []);
  assert.equal(scaleNutrients(result.food.nutrients, result.food.servingSize).kcal, 750);
  assert.match(call.input, /NOT meal totals/);
  assert.equal(call.text.format.schema.properties.estimated.type, 'boolean');
});

test('incomplete meal estimates fail safely instead of creating missing totals', async () => {
  const assistant = createFoodAi({ client: { responses: { create: async () => ({ output_text: JSON.stringify({ ...proposal, servingSize: null }) }) } } });
  await assert.rejects(assistant.enrich({ mode: 'meal', query: 'Comida', barcode: '', basis: 'g' }), /comida completa/);
});
