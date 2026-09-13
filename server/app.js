import crypto from 'node:crypto';
import express from 'express';
import {
  localDate,
  macroCalories,
  scaleNutrients,
  sumNutrients,
  validDate,
} from '../shared/nutrition.js';

const MEALS = new Set(['Desayuno', 'Comida', 'Cena', 'Snacks']);
const ACTIVITIES = new Set([1.2, 1.375, 1.55, 1.725, 1.9]);
// OFF permits 15 product or 10 search reads per minute. A shared 6.1s queue
// stays below both limits, including mixed request traffic.
const OFF_MIN_INTERVAL_MS = 6_100;
const OFF_CACHE_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1_000;

const defaultProfile = () => ({ carbs: 0, protein: 0, fat: 0 });
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value) => value === null || finiteNumber(value);
const clone = (value) => structuredClone(value);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assert(condition, message) {
  if (!condition) throw new ApiError(400, message);
}

function publicDocument(document) {
  if (!document) return document;
  const { _id, ...result } = document;
  return result;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((item) => item.trim().split(/=(.*)/s)).filter(([key]) => key));
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function constantTimeEquals(expected, received) {
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const receivedHash = crypto.createHash('sha256').update(String(received ?? '')).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash);
}

function normalizeNutrients(value) {
  assert(isObject(value), 'Los nutrientes son obligatorios.');
  for (const key of ['kcal', 'carbs', 'protein', 'fat']) {
    assert(nullableNumber(value[key]), `Nutriente inválido: ${key}.`);
    assert(value[key] === null || value[key] >= 0, `Nutriente inválido: ${key}.`);
  }
  return { kcal: value.kcal, carbs: value.carbs, protein: value.protein, fat: value.fat };
}

function normalizeFood(value, { requireId = false } = {}) {
  assert(isObject(value), 'Alimento inválido.');
  if (requireId) assert(isUuid(value.id), 'El id del alimento debe ser un UUID.');
  assert(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 200, 'El nombre es obligatorio.');
  assert(value.brand === undefined || value.brand === null || typeof value.brand === 'string', 'Marca inválida.');
  assert(value.barcode === undefined || value.barcode === null || (typeof value.barcode === 'string' && value.barcode.length <= 64), 'Código de barras inválido.');
  assert(value.basis === 'g' || value.basis === 'ml', 'La base debe ser g o ml.');
  assert(value.servingSize === undefined || value.servingSize === null || (finiteNumber(value.servingSize) && value.servingSize > 0), 'Ración inválida.');
  const food = {
    ...(requireId ? { id: value.id } : {}),
    name: value.name.trim(),
    brand: value.brand?.trim() || undefined,
    barcode: value.barcode?.trim() || undefined,
    basis: value.basis,
    nutrients: normalizeNutrients(value.nutrients),
    servingSize: value.servingSize,
    favorite: value.favorite === true,
    basisUncertain: value.basisUncertain === true || undefined,
    source: typeof value.source === 'string' ? value.source : undefined,
    sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
    recipe: isObject(value.recipe) ? clone(value.recipe) : undefined,
  };
  return Object.fromEntries(Object.entries(food).filter(([, item]) => item !== undefined));
}

function normalizeProfile(value) {
  assert(isObject(value), 'Perfil inválido.');
  const profile = {};
  for (const key of ['carbs', 'protein', 'fat']) {
    assert(finiteNumber(value[key]) && value[key] >= 0, `Objetivo inválido: ${key}.`);
    profile[key] = value[key];
  }
  for (const key of ['weight', 'height', 'age']) {
    if (value[key] !== undefined && value[key] !== null) {
      assert(finiteNumber(value[key]) && value[key] > 0, `Campo inválido: ${key}.`);
      profile[key] = value[key];
    }
  }
  if (value.sex !== undefined && value.sex !== null) {
    assert(value.sex === 'male' || value.sex === 'female', 'Sexo inválido.');
    profile.sex = value.sex;
  }
  if (value.activity !== undefined && value.activity !== null) {
    assert(ACTIVITIES.has(value.activity), 'Nivel de actividad inválido.');
    profile.activity = value.activity;
  }
  profile.kcal = macroCalories(profile);
  return profile;
}

function normalizeEntry(value, { partial = false } = {}) {
  assert(isObject(value), 'Entrada inválida.');
  const entry = {};
  if (!partial) assert(isUuid(value.id), 'El id de la entrada debe ser un UUID.');
  if (value.id !== undefined) assert(isUuid(value.id), 'El id de la entrada debe ser un UUID.');
  if (!partial) entry.id = value.id;
  if (value.date !== undefined) {
    assert(typeof value.date === 'string' && validDate(value.date), 'Fecha inválida.');
    entry.date = value.date;
  } else if (!partial) throw new ApiError(400, 'La fecha es obligatoria.');
  if (value.meal !== undefined) {
    assert(MEALS.has(value.meal), 'Comida inválida.');
    entry.meal = value.meal;
  } else if (!partial) throw new ApiError(400, 'La comida es obligatoria.');
  if (value.quantity !== undefined) {
    assert(finiteNumber(value.quantity) && value.quantity > 0 && value.quantity <= 10_000, 'Cantidad inválida.');
    entry.quantity = value.quantity;
  } else if (!partial) throw new ApiError(400, 'La cantidad es obligatoria.');
  if (partial && value.food !== undefined) throw new ApiError(400, 'El alimento de una entrada no se puede modificar.');
  if (value.food !== undefined) entry.food = normalizeFood(value.food, { requireId: true });
  else if (!partial) throw new ApiError(400, 'El alimento es obligatorio.');
  return entry;
}

function fromOff(product) {
  const nutrients = product.nutriments || {};
  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = typeof value === 'number' ? value : Number(value);
    return finiteNumber(number) ? number : null;
  };
  const per = String(product.nutrition_data_per || '').toLowerCase();
  const quantity = String(product.quantity || '').toLowerCase();
  const basisUncertain = per !== '100g' && per !== '100ml';
  const basis = per === '100ml' || (basisUncertain && /(?:^|\s)(?:ml|cl|l)(?:\s|$)/.test(quantity)) ? 'ml' : 'g';
  return {
    id: crypto.randomUUID(), name: product.product_name_es || product.product_name || product.product_name_en || 'Producto sin nombre',
    brand: product.brands || undefined, barcode: product.code || undefined,
    nutrients: { kcal: numberOrNull(nutrients['energy-kcal_100g']), carbs: numberOrNull(nutrients.carbohydrates_100g), protein: numberOrNull(nutrients.proteins_100g), fat: numberOrNull(nutrients.fat_100g) },
    basis, ...(basisUncertain ? { basisUncertain: true } : {}), source: 'openfoodfacts', sourceId: product.code || undefined,
  };
}

/** Creates the HTTP application. Pass a MongoClient (preferred) or a database handle for tests. */
export function createApp(databaseOrClient, options = {}) {
  const client = databaseOrClient?.db ? databaseOrClient : databaseOrClient?.client;
  const catalog = client ? client.db('nutrition_catalog') : databaseOrClient;
  const tracking = client ? client.db('nutrition_tracking') : databaseOrClient;
  if (!catalog?.collection || !tracking?.collection) throw new Error('createApp requiere un MongoClient o una base de datos MongoDB.');
  const foods = catalog.collection('foods');
  const lookupCache = catalog.collection('lookup_cache');
  const searchCache = catalog.collection('search_cache');
  const profileCollection = tracking.collection('profile');
  const entries = tracking.collection('entries');
  const goals = tracking.collection('goals');
  const sessions = new Map();
  const env = options.env || process.env;
  const production = env.NODE_ENV === 'production';
  const password = env.APP_PASSWORD;
  const bypass = !production && env.DEV_AUTH_BYPASS === '1';
  const sessionSecret = env.SESSION_SECRET || crypto.randomBytes(32).toString('base64url');
  const configuredOrigin = env.APP_ORIGIN?.replace(/\/$/, '');
  const offUserAgent = env.OFF_USER_AGENT || 'nutri-diary/0.1 (personal diary)';
  let lastOffRequest = 0;
  let offQueue = Promise.resolve();
  const loginAttempts = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const issueSession = (res) => {
    const id = crypto.randomUUID();
    const expires = Date.now() + SESSION_MS;
    sessions.set(id, expires);
    const token = `${id}.${sign(id, sessionSecret)}`;
    res.cookie('nutri_session', token, { httpOnly: true, sameSite: 'strict', secure: production, path: '/', maxAge: SESSION_MS });
  };
  const authenticated = (req) => {
    if (bypass) return true;
    if (!password) return false;
    const token = parseCookies(req.headers.cookie).nutri_session;
    const [id, signature] = typeof token === 'string' ? token.split('.') : [];
    const expires = sessions.get(id);
    return Boolean(id && signature && expires && expires > Date.now() && constantTimeEquals(sign(id, sessionSecret), signature));
  };
  const requireSameOrigin = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const expected = configuredOrigin || `${req.protocol}://${req.get('host')}`;
    if (origin !== expected) return next(new ApiError(403, 'Origen no permitido.'));
    return next();
  };
  const requireAuth = (req, res, next) => {
    if (authenticated(req)) return next();
    if (!password && !bypass) return next(new ApiError(503, 'La autenticación no está configurada.'));
    return next(new ApiError(401, 'Autenticación requerida.'));
  };
  const allowLoginAttempt = (req) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const recent = (loginAttempts.get(key) || []).filter((at) => at > now - 15 * 60 * 1000);
    if (recent.length >= 8) return false;
    recent.push(now);
    if (loginAttempts.size > 1_000) loginAttempts.clear();
    loginAttempts.set(key, recent);
    return true;
  };

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post('/api/login', requireSameOrigin, (req, res, next) => {
    if (!password) return next(new ApiError(503, 'La autenticación no está configurada.'));
    if (!allowLoginAttempt(req)) return next(new ApiError(429, 'Demasiados intentos. Inténtalo más tarde.'));
    if (!constantTimeEquals(password, req.body?.password)) return next(new ApiError(401, 'Contraseña incorrecta.'));
    issueSession(res);
    return res.json({ authenticated: true });
  });
  app.get('/api/session', (req, res) => res.json({ authenticated: authenticated(req) }));
  app.post('/api/logout', requireSameOrigin, (req, res) => {
    const id = parseCookies(req.headers.cookie).nutri_session?.split('.')[0];
    if (id) sessions.delete(id);
    res.clearCookie('nutri_session', { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
    res.json({ ok: true });
  });
  app.use('/api', requireSameOrigin, requireAuth);

  app.get('/api/profile', async (req, res) => {
    const profile = publicDocument(await profileCollection.findOne({ key: 'primary' }));
    res.json(profile ? profile.value : defaultProfile());
  });
  app.put('/api/profile', async (req, res) => {
    const profile = normalizeProfile(req.body);
    const effectiveDate = req.body.effectiveDate || localDate();
    assert(typeof effectiveDate === 'string' && validDate(effectiveDate), 'Fecha efectiva inválida.');
    await profileCollection.updateOne({ key: 'primary' }, { $set: { key: 'primary', value: profile, updatedAt: new Date() } }, { upsert: true });
    await goals.updateOne({ effectiveDate }, { $set: { effectiveDate, ...profile, updatedAt: new Date() } }, { upsert: true });
    res.json(profile);
  });

  app.get('/api/foods', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = query ? { $or: [{ name: { $regex: escapedQuery, $options: 'i' } }, { brand: { $regex: escapedQuery, $options: 'i' } }, { barcode: { $regex: escapedQuery, $options: 'i' } }] } : {};
    const result = await foods.find(filter, { projection: { _id: 0 } }).sort({ favorite: -1, name: 1 }).limit(100).toArray();
    res.json(result);
  });
  app.post('/api/foods', async (req, res) => {
    const food = normalizeFood({ ...req.body, id: crypto.randomUUID() }, { requireId: true });
    try { await foods.insertOne(food); } catch (error) {
      if (error?.code === 11000 && food.barcode) throw new ApiError(409, 'Ya existe un alimento con ese código de barras.');
      throw error;
    }
    res.status(201).json(food);
  });
  app.patch('/api/foods/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'El id del alimento debe ser un UUID.');
    const current = await foods.findOne({ id: req.params.id });
    if (!current) throw new ApiError(404, 'Alimento no encontrado.');
    const food = normalizeFood({ ...publicDocument(current), ...req.body, id: req.params.id }, { requireId: true });
    try { await foods.updateOne({ id: food.id }, { $set: food }); } catch (error) {
      if (error?.code === 11000 && food.barcode) throw new ApiError(409, 'Ya existe un alimento con ese código de barras.');
      throw error;
    }
    res.json(food);
  });

  async function offFetch(url) {
    const task = async () => {
      const wait = OFF_MIN_INTERVAL_MS - (Date.now() - lastOffRequest);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastOffRequest = Date.now();
      const response = await fetch(url, { headers: { 'User-Agent': offUserAgent }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new ApiError(502, 'Open Food Facts no está disponible.');
      return response.json();
    };
    const pending = offQueue.then(task, task);
    offQueue = pending.catch(() => {});
    return pending;
  }
  app.get('/api/lookup/:barcode', async (req, res) => {
    const barcode = req.params.barcode;
    assert(/^[0-9]{8,14}$/.test(barcode), 'Código de barras inválido.');
    const personal = await foods.findOne({ barcode }, { projection: { _id: 0 } });
    if (personal) return res.json(personal);
    const cached = await lookupCache.findOne({ barcode, expiresAt: { $gt: new Date() } });
    if (cached?.food) return res.json(publicDocument(cached.food));
    const payload = await offFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    if (payload.status !== 1 || !payload.product) throw new ApiError(404, 'Producto no encontrado.');
    const food = fromOff(payload.product);
    food.barcode = barcode;
    await lookupCache.updateOne({ barcode }, { $set: { barcode, food, expiresAt: new Date(Date.now() + OFF_CACHE_MS) } }, { upsert: true });
    res.json(food);
  });
  app.get('/api/search', async (req, res) => {
    const provider = req.query.provider;
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    assert(query.length >= 2 && query.length <= 100, 'La búsqueda debe tener entre 2 y 100 caracteres.');
    if (provider === 'off') {
      const cacheKey = query.toLocaleLowerCase('es');
      const cached = await searchCache.findOne({ cacheKey, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, foods: 1 } });
      if (cached?.foods) return res.json(cached.foods);
      const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
      url.search = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20' });
      const payload = await offFetch(url);
      const result = (payload.products || []).map(fromOff);
      await searchCache.updateOne({ cacheKey }, { $set: { cacheKey, foods: result, expiresAt: new Date(Date.now() + OFF_CACHE_MS) } }, { upsert: true });
      return res.json(result);
    }
    if (provider === 'usda') {
      if (!env.USDA_API_KEY) throw new ApiError(503, 'La búsqueda USDA no está configurada: falta USDA_API_KEY.');
      const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
      url.search = new URLSearchParams({ api_key: env.USDA_API_KEY, query, pageSize: '20' });
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new ApiError(502, 'USDA no está disponible.');
      const payload = await response.json();
      return res.json((payload.foods || []).map((item) => {
        const nutrient = (id, unit) => item.foodNutrients?.find((row) => row.nutrientId === id && String(row.unitName || '').toUpperCase() === unit)?.value ?? null;
        return { id: crypto.randomUUID(), name: item.description, brand: item.brandOwner || undefined, basis: 'g', nutrients: { kcal: nutrient(1008, 'KCAL'), carbs: nutrient(1005, 'G'), protein: nutrient(1003, 'G'), fat: nutrient(1004, 'G') }, source: 'usda', sourceId: String(item.fdcId) };
      }));
    }
    throw new ApiError(400, 'Proveedor de búsqueda inválido.');
  });

  app.get('/api/entries', async (req, res) => {
    const date = req.query.date;
    assert(typeof date === 'string' && validDate(date), 'Fecha inválida.');
    res.json(await entries.find({ date }, { projection: { _id: 0, totals: 0 } }).sort({ meal: 1, id: 1 }).toArray());
  });
  app.post('/api/entries', async (req, res) => {
    const entry = normalizeEntry(req.body);
    const existing = await entries.findOne({ id: entry.id }, { projection: { _id: 0, totals: 0 } });
    if (existing) return res.json(existing);
    const stored = { ...entry, food: clone(entry.food), totals: scaleNutrients(entry.food.nutrients, entry.quantity), createdAt: new Date() };
    try { await entries.insertOne(stored); } catch (error) {
      if (error?.code === 11000) return res.json(await entries.findOne({ id: entry.id }, { projection: { _id: 0, totals: 0 } }));
      throw error;
    }
    return res.status(201).json(entry);
  });
  app.patch('/api/entries/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'El id de la entrada debe ser un UUID.');
    const current = await entries.findOne({ id: req.params.id });
    if (!current) throw new ApiError(404, 'Entrada no encontrada.');
    const changes = normalizeEntry(req.body, { partial: true });
    const entry = { ...publicDocument(current), ...changes, id: req.params.id };
    entry.totals = scaleNutrients(entry.food.nutrients, entry.quantity);
    await entries.updateOne({ id: entry.id }, { $set: entry });
    const { totals, _id, ...result } = entry;
    res.json(result);
  });
  app.delete('/api/entries/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'El id de la entrada debe ser un UUID.');
    await entries.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  });
  app.get('/api/progress', async (req, res) => {
    const { from, to } = req.query;
    assert(typeof from === 'string' && validDate(from) && typeof to === 'string' && validDate(to) && from <= to, 'Rango de fechas inválido.');
    const rangeDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    assert(rangeDays <= 366, 'El rango máximo es de 366 días.');
    const [entryRows, goalRows] = await Promise.all([
      entries.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 }).toArray(),
      goals.find({ effectiveDate: { $lte: to } }, { projection: { _id: 0 } }).sort({ effectiveDate: 1 }).toArray(),
    ]);
    const byDate = new Map();
    for (const entry of entryRows) {
      const row = byDate.get(entry.date) || { date: entry.date, nutrients: [], count: 0 };
      row.nutrients.push(entry.totals || scaleNutrients(entry.food.nutrients, entry.quantity)); row.count += 1; byDate.set(entry.date, row);
    }
    const output = [];
    for (let day = new Date(`${from}T12:00:00Z`); day <= new Date(`${to}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10); const row = byDate.get(date) || { nutrients: [], count: 0 };
      const total = row.count ? sumNutrients(row.nutrients) : { kcal: null, carbs: null, protein: null, fat: null }; const activeGoal = [...goalRows].reverse().find((goal) => goal.effectiveDate <= date) || defaultProfile();
      output.push({ date, kcal: total.kcal, carbs: total.carbs, protein: total.protein, fat: total.fat, count: row.count, goal: { kcal: activeGoal.kcal ?? macroCalories(activeGoal), carbs: activeGoal.carbs, protein: activeGoal.protein, fat: activeGoal.fat } });
    }
    res.json(output);
  });
  app.get('/api/export', async (req, res) => {
    const [profile, allFoods, allEntries, allGoals] = await Promise.all([
      profileCollection.findOne({ key: 'primary' }), foods.find({}, { projection: { _id: 0 } }).toArray(), entries.find({}, { projection: { _id: 0 } }).toArray(), goals.find({}, { projection: { _id: 0 } }).sort({ effectiveDate: 1 }).toArray(),
    ]);
    res.json({ profile: profile?.value || defaultProfile(), foods: allFoods, entries: allEntries.map(publicDocument), goals: allGoals });
  });

  app.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande.' });
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'JSON inválido.' });
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  });
  return app;
}

export async function ensureIndexes(client) {
  await Promise.all([
    client.db('nutrition_catalog').collection('foods').createIndex({ id: 1 }, { unique: true }),
    client.db('nutrition_catalog').collection('foods').createIndex({ barcode: 1 }, { name: 'barcode_unique', unique: true, partialFilterExpression: { barcode: { $type: 'string' } } }),
    client.db('nutrition_catalog').collection('lookup_cache').createIndex({ barcode: 1 }, { unique: true }),
    client.db('nutrition_catalog').collection('lookup_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    client.db('nutrition_catalog').collection('search_cache').createIndex({ cacheKey: 1 }, { unique: true }),
    client.db('nutrition_catalog').collection('search_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    client.db('nutrition_tracking').collection('entries').createIndex({ id: 1 }, { unique: true }),
    client.db('nutrition_tracking').collection('entries').createIndex({ date: 1 }),
    client.db('nutrition_tracking').collection('goals').createIndex({ effectiveDate: 1 }, { unique: true }),
  ]);
}
