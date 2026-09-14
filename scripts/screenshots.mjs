/** Regenerates the screenshots used by the README from a seeded diary, so the
 *  images in the repository always show the app as it currently behaves.
 *  Run with: node scripts/screenshots.mjs */
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import express from 'express';
import { createApp, ensureIndexes } from '../server/app.js';

const out = new URL('../docs/screens/', import.meta.url);
await mkdir(out, { recursive: true });

const mongo = await MongoMemoryServer.create();
const client = await new MongoClient(mongo.getUri()).connect();
await ensureIndexes(client);
const app = createApp(client, { env: { DEV_AUTH_BYPASS: '1' } });
app.use(express.static(new URL('../dist', import.meta.url).pathname));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const api = async (path, method = 'GET', body) => {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
  return response.json();
};
const day = offset => {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(date);
};

const [first] = await api('/api/profiles');
await api(`/api/profiles/${first.id}`, 'PUT', { name: 'Alex', carbs: 250, protein: 165, fat: 70, weight: 72, height: 175, age: 30, sex: 'male', activity: 1.55 });
await api('/api/profiles', 'POST', { name: 'Nora', carbs: 185, protein: 120, fat: 55, weight: 60, height: 165, age: 31, sex: 'female', activity: 1.375 });

const food = (name, brand, nutrients) => api('/api/foods', 'POST', { name, brand, basis: 'g', nutrients });
const oats = await food('Copos de avena', 'Hacendado', { kcal: 375, carbs: 59, protein: 13, fat: 7 });
const yogurt = await food('Yogur griego natural', 'Hacendado', { kcal: 97, carbs: 4, protein: 9, fat: 5 });
const chicken = await food('Pechuga de pollo', null, { kcal: 108, carbs: 0, protein: 23, fat: 1.8 });
const rice = await food('Arroz blanco cocido', null, { kcal: 130, carbs: 28, protein: 2.7, fat: 0.3 });
const banana = await food('Plátano', null, { kcal: 89, carbs: 23, protein: 1.1, fat: 0.3 });
const salmon = await food('Salmón a la plancha', null, { kcal: 208, carbs: 0, protein: 20, fat: 13 });

const log = (date, meal, item, quantity) =>
  api(`/api/entries?profile=${first.id}`, 'POST', { id: randomUUID(), date, meal, food: item, quantity, profileId: first.id });

for (const offset of [6, 5, 4, 3, 2, 1]) {
  await log(day(offset), 'Desayuno', oats, 60 + offset * 3);
  await log(day(offset), 'Comida', chicken, 150 + offset * 5);
  await log(day(offset), 'Comida', rice, 180);
  await log(day(offset), 'Cena', salmon, 140);
}
await log(day(0), 'Desayuno', oats, 70);
await log(day(0), 'Desayuno', yogurt, 150);
await log(day(0), 'Comida', chicken, 165);
await log(day(0), 'Comida', rice, 200);
await log(day(0), 'Merienda', banana, 120);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await context.newPage();
const tab = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
const settle = () => page.waitForTimeout(450);

await page.goto(base);
await page.evaluate(id => localStorage.setItem('nutri-profile', id), first.id);
await page.reload();
await page.getByRole('navigation').waitFor({ state: 'visible' });
await settle();
await page.screenshot({ path: new URL('today.png', out).pathname });

await page.getByRole('button', { name: 'Añadir a Cena', exact: true }).click();
await page.locator('.result-main').filter({ hasText: 'Salmón' }).first().click();
await page.locator('.also-for input[type=checkbox]').first().check();
await settle();
await page.screenshot({ path: new URL('add.png', out).pathname });
await page.getByRole('button', { name: 'Cancelar', exact: true }).click().catch(() => {});
await page.keyboard.press('Escape').catch(() => {});

await page.goto(base);
await page.getByRole('navigation').waitFor({ state: 'visible' });
await tab('Progreso');
await settle();
await page.screenshot({ path: new URL('progress.png', out).pathname });

await browser.close();
server.close();
await client.close();
await mongo.stop();
console.log('Screenshots written to docs/screens/');
