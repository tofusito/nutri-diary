import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import express from 'express';
import { createApp, ensureIndexes } from '../server/app.js';

const mongo = await MongoMemoryServer.create();
const client = await new MongoClient(mongo.getUri()).connect();
await ensureIndexes(client);
const app = createApp(client, { env: { DEV_AUTH_BYPASS: '1' } });
app.use(express.static(new URL('../dist', import.meta.url).pathname));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const request = async (path, method = 'GET', body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  assert.ok(r.ok); return r.json();
};
const tab = name => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
try {
  const [profile] = await request('/api/profiles');
  const diaryDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
  await page.goto(base); await page.evaluate(id => localStorage.setItem('nutri-profile', id), profile.id); await page.reload();
  await page.getByRole('navigation').waitFor({ state: 'visible' });
  await tab('Perfil');
  for (const label of ['Hidratos', 'Proteínas', 'Grasas']) {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(''); assert.match(await page.locator('.kcal-result').innerText(), /—/);
    await field.fill('-1'); assert.match(await page.locator('.kcal-result').innerText(), /—/);
    await field.fill('0'); assert.ok(await page.getByRole('navigation').isVisible());
    await field.fill('12.5'); assert.ok(!((await page.locator('.kcal-result').innerText()).includes('—')));
    await field.fill('0');
  }
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await page.getByText('Perfil guardado.', { exact: true }).waitFor();
  assert.equal((await request('/api/profiles'))[0].protein, 0);
  await page.getByRole('button', { name: '+ Crear otro perfil', exact: true }).click();
  assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), '');
  await tab('Alimentos'); await page.getByRole('button', { name: '+ Nuevo', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Test stability');
  await page.getByLabel('Proteínas', { exact: true }).fill('0');
  await page.route('**/api/foods', async route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fallo simulado"}' }) : route.continue());
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fallo simulado' }).waitFor();
  assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Test stability');
  await page.unroute('**/api/foods');
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const [food] = await request('/api/foods'); assert.equal(food.nutrients.protein, 0); assert.equal(food.nutrients.fat, null);
  await tab('Hoy'); await page.getByRole('button', { name: 'Añadir a Desayuno', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Test stability' }).click();
  await page.getByLabel('Cantidad', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByText('Introduce una cantidad mayor que cero para cada persona.', { exact: true }).waitFor();
  await page.getByLabel('Cantidad', { exact: true }).fill('80');
  await page.route('**/api/entries?*', async route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Registro fallido"}' }) : route.continue());
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByText('Registro fallido', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Cantidad', { exact: true }).inputValue(), '80');
  await page.unroute('**/api/entries?*');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.entry').count(), 1);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Añadir a Cena', exact: true }).click();
  await page.locator('.result').filter({ hasText: 'Test stability' }).click();
  await page.getByLabel('Cantidad', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.entry.pending').count(), 1);
  assert.equal(await page.locator('.entry').count(), 2);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const syncDeadline = Date.now() + 5_000;
  let syncedEntries = [];
  while (Date.now() < syncDeadline) {
    syncedEntries = await request('/api/entries?date=' + diaryDate);
    if (syncedEntries.length === 2) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(syncedEntries.length, 2, 'offline entry was not synchronized');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Hoy', 'Alimentos', 'Progreso', 'Perfil']) {
      await tab(name); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${name} ${width}`);
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: empty/negative/zero/decimal macros; persisted zero; new profile; retained drafts on 503; unknown vs zero nutrients; invalid portions; retry without duplicate; four tabs at four widths; no uncaught errors.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await client.close(); await mongo.stop(); }
