import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  await page.getByLabel('kcal', { exact: true }).fill('100');
  await page.getByLabel('Proteínas', { exact: true }).fill('0');
  await page.route('**/api/foods', async route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fallo simulado"}' }) : route.continue());
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Fallo simulado' }).waitFor();
  assert.equal(await page.getByLabel('Nombre', { exact: true }).inputValue(), 'Test stability');
  await page.unroute('**/api/foods');
  await page.getByRole('button', { name: 'Guardar alimento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const [food] = await request('/api/foods'); assert.equal(food.nutrients.protein, 0); assert.equal(food.nutrients.fat, null);
  await request('/api/foods', 'POST', { id: randomUUID(), name: 'No kcal stability', basis: 'g', nutrients: { kcal: null, carbs: null, protein: 2, fat: null } });
  await page.reload(); await page.getByRole('navigation').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Añadir a Desayuno', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /No kcal stability/ }).count(), 0);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
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
  // A write from another device must reach an open diary on its own. Returning
  // to the app reloads immediately; while it stays on screen the poll does it.
  await tab('Hoy');
  const remote = { id: randomUUID(), date: diaryDate, meal: 'Cena', food, quantity: 55 };
  await request('/api/entries', 'POST', remote);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('.entry').filter({ hasText: '55 g' }).waitFor({ timeout: 10_000 });
  const polled = { id: randomUUID(), date: diaryDate, meal: 'Merienda', food, quantity: 45 };
  await request('/api/entries', 'POST', polled);
  await page.locator('.entry').filter({ hasText: '45 g' }).waitFor({ timeout: 30_000 });
  await request(`/api/entries/${remote.id}`, 'DELETE');
  await request(`/api/entries/${polled.id}`, 'DELETE');
  await page.locator('.entry').filter({ hasText: '45 g' }).waitFor({ state: 'detached', timeout: 30_000 });

  // With the keyboard open the visible area is roughly half a phone. The search
  // sheet has to stay usable in it: the field reachable and the list scrolling
  // inside the sheet rather than the sheet sliding out of view.
  for (const height of [844, 420]) {
    await page.setViewportSize({ width: 390, height });
    await tab('Hoy');
    await page.getByRole('button', { name: 'Añadir a Desayuno', exact: true }).click();
    const sheet = page.getByRole('dialog');
    // The sheet slides in; measuring mid-animation reads a transformed box.
    await sheet.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const box = await sheet.boundingBox();
    assert.ok(box.y >= -1, `sheet starts above the viewport at ${height}px`);
    assert.ok(box.y + box.height <= height + 1, `sheet overflows the viewport at ${height}px`);
    for (const control of [page.getByPlaceholder('Buscar o escribir un código'), page.getByRole('button', { name: '+ A mano', exact: true })]) {
      const rect = await control.boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= height + 1, `a sheet control is off screen at ${height}px`);
    }
    // The sheet must reach the bottom of the visible area: any gap there is
    // where the page behind showed through under the keyboard.
    assert.ok(Math.abs(box.y + box.height - height) <= 1, `sheet leaves a ${Math.round(height - box.y - box.height)}px gap at ${height}px`);
    assert.ok(await page.locator('.results').evaluate(el => el.scrollHeight >= el.clientHeight), 'results should scroll inside the sheet');
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  }

  // Scanning into the barcode field: the camera is denied here, so this drives
  // the manual fallback and checks the code lands back on the form.
  await page.setViewportSize({ width: 390, height: 844 });
  await tab('Alimentos');
  await page.getByRole('button', { name: '+ Nuevo', exact: true }).click();
  await page.getByRole('button', { name: 'Escanear el código de barras', exact: true }).click();
  const manual = page.getByPlaceholder('O escribe el código');
  await manual.waitFor();
  await manual.fill('8410014477743');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await manual.waitFor({ state: 'hidden' });
  assert.equal(await page.getByPlaceholder('Escanéalo o escríbelo').inputValue(), '8410014477743', 'scanned code did not reach the form');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // Deleting a profile only appears once a second one exists, so it can never
  // remove the last diary.
  await request('/api/profiles', 'POST', { name: 'Segundo perfil', carbs: 10, protein: 10, fat: 10 });
  await page.reload(); await page.getByRole('navigation').waitFor({ state: 'visible' });
  await tab('Perfil');

  // The destructive profile action must stay locked until the name is typed.
  await page.getByRole('button', { name: /^Eliminar el perfil/ }).click();
  const confirmDelete = page.locator('.danger-panel').getByRole('button', { name: 'Eliminar', exact: true });
  assert.ok(await confirmDelete.isDisabled(), 'delete enabled before confirming the name');
  await page.locator('.danger-panel input').fill('Perfil');
  assert.ok(await confirmDelete.isDisabled(), 'delete enabled on a partial name');
  await page.locator('.danger-panel input').fill((await request('/api/profiles'))[0].name);
  assert.ok(await confirmDelete.isEnabled(), 'delete stayed locked with the exact name');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  const zeroMacro = page.getByLabel('Hidratos', { exact: true });
  await zeroMacro.click();
  await zeroMacro.pressSequentially('37');
  assert.equal(await zeroMacro.inputValue(), '37', 'zero macro should be replaced on first typing');
  await tab('Hoy');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Añadir a Desayuno', exact: true }).click();
  // A virtual keyboard changes the visual viewport without resizing the page.
  // Exercise both keyboard shrink and Safari's pan; a real iPhone is still needed.
  for (const [height, offsetTop] of [[410, 0], [360, 80], [300, 30], [844, 0]]) {
    await page.evaluate(({ height, offsetTop }) => {
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: height });
      Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: offsetTop });
      window.visualViewport.dispatchEvent(new Event('resize'));
    }, { height, offsetTop });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('.modal-backdrop').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.y >= offsetTop - 1 && bounds.y + bounds.height <= offsetTop + height + 1, 'sheet must fit the visible viewport');
    assert.ok((await page.locator('.results').boundingBox()).height > 60, 'search results must retain usable space');
    const backing = await page.locator('.modal-backdrop').evaluate(el => {
      const style = getComputedStyle(el, '::after');
      return { color: style.backgroundColor, top: parseFloat(style.top), height: parseFloat(style.height), panelHeight: el.getBoundingClientRect().height };
    });
    assert.equal(backing.color, 'rgb(27, 28, 33)', 'keyboard backing must match the sheet, not the black veil');
    assert.ok(Math.abs(backing.top - backing.panelHeight) <= 1 && backing.height >= 844, 'surface must continue below the visible sheet');
    if (height === 360) await page.screenshot({ path: '/tmp/nutri-keyboard-open.png' });
  }
  await page.screenshot({ path: '/tmp/nutri-keyboard-review.png' });
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: macro editing; retained drafts; invalid portions; offline sync; responsive tabs; live diary updates; search in reduced and offset visual viewports; barcode entry; protected profile deletion; no uncaught errors.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await client.close(); await mongo.stop(); }
