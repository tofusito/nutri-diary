import {test} from 'node:test';
import assert from 'node:assert/strict';
import {macroCalories,scaleNutrients,sumNutrients,estimateEnergy,validDate,localDate} from '../shared/nutrition.js';

test('goals derive energy from grams without separate calorie input',()=>{
  assert.equal(macroCalories({carbs:250,protein:150,fat:70}),2230);
  assert.throws(()=>macroCalories({carbs:-1,protein:100,fat:20}));
});
test('portions preserve declared kcal and unknown nutrient values',()=>{
  assert.deepEqual(scaleNutrients({kcal:200,carbs:20,protein:null,fat:4},75),{kcal:150,carbs:15,protein:null,fat:3});
  assert.throws(()=>scaleNutrients({kcal:1},NaN));
});
test('missing data never turns into a false zero total',()=>{
  assert.deepEqual(sumNutrients([{kcal:100,carbs:20,protein:null,fat:1},{kcal:50,carbs:10,protein:3,fat:0}]),{kcal:150,carbs:30,protein:null,fat:1});
  assert.equal(sumNutrients([]).kcal,0);
});
test('Mifflin separates resting expenditure from activity estimate',()=>{
  assert.deepEqual(estimateEnergy({weight:80,height:180,age:30,sex:'male',activity:1.55}),{resting:1780,maintenance:2759});
  assert.deepEqual(estimateEnergy({weight:80,height:180,age:30,sex:'female',activity:1.2}),{resting:1614,maintenance:1937});
  assert.throws(()=>estimateEnergy({weight:80,height:180,age:12,sex:'male',activity:1.2}));
});
test('calendar validation and Madrid date boundaries including summer time',()=>{
  assert.equal(validDate('2026-02-29'),false); assert.equal(validDate('2024-02-29'),true);
  assert.equal(validDate('2026-13-01'),false); assert.equal(validDate('yesterday'),false);
  assert.equal(localDate(new Date('2026-09-12T22:30:00Z')),'2026-09-13');
  assert.equal(localDate(new Date('2026-01-01T22:30:00Z')),'2026-01-01');
});
