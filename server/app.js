import crypto from 'node:crypto';
import express from 'express';
import {
  localDate,
  macroCalories,
  scaleNutrients,
  sumNutrients,
  validDate,
} from '../shared/nutrition.js';
import { createFoodAi, FoodAiError, normalizeFoodAiRequest } from './food-ai.js';

const MEALS = new Set(['Desayuno', 'Comida', 'Merienda', 'Cena', 'Snacks']);
const MEAL_ORDER = ['Desayuno', 'Comida', 'Merienda', 'Cena', 'Snacks'];
const ACTIVITIES = new Set([1.2, 1.375, 1.55, 1.725, 1.9]);
// OFF documents 10 searches and 100 product reads per minute. Each kind gets
// its own queue so scanning a barcode is not held back by the search budget.
const OFF_SEARCH_INTERVAL_MS = 6_100;
const OFF_PRODUCT_INTERVAL_MS = 620;
const OFF_CACHE_MS = 30 * 24 * 60 * 60 * 1_000;
const OFF_MISS_CACHE_MS = 24 * 60 * 60 * 1_000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1_000;
const ACCESS_CERTS_TTL_MS = 60 * 60 * 1_000;

const defaultProfile = () => ({ carbs: 0, protein: 0, fat: 0, kcal: 0 });
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

function normalizeAiMetadata(value) {
  if (value === undefined || value === null) return undefined;
  assert(isObject(value), 'Metadatos de IA inválidos.');
  assert(typeof value.model === 'string' && value.model.length > 0 && value.model.length <= 80, 'Modelo de IA inválido.');
  assert(['high', 'medium', 'low'].includes(value.confidence), 'Confianza de IA inválida.');
  assert(typeof value.query === 'string' && value.query.length > 0 && value.query.length <= 180, 'Consulta de IA inválida.');
  assert(typeof value.generatedAt === 'string' && value.generatedAt.length <= 40, 'Fecha de IA inválida.');
  assert(Array.isArray(value.sources) && value.sources.length <= 6, 'Fuentes de IA inválidas.');
  const sources = value.sources.map(source => {
    assert(isObject(source) && typeof source.title === 'string' && source.title.length <= 160, 'Título de fuente inválido.');
    assert(typeof source.url === 'string' && /^https:\/\//.test(source.url) && source.url.length <= 500, 'URL de fuente inválida.');
    return { title: source.title, url: source.url };
  });
  return { model: value.model, confidence: value.confidence, query: value.query, sources, generatedAt: value.generatedAt };
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
    ai: normalizeAiMetadata(value.ai),
    recipe: isObject(value.recipe) ? clone(value.recipe) : undefined,
    quantityText: typeof value.quantityText === 'string' ? value.quantityText.slice(0, 60) : undefined,
    image: typeof value.image === 'string' && /^https:\/\//.test(value.image) ? value.image.slice(0, 500) : undefined,
  };
  return Object.fromEntries(Object.entries(food).filter(([, item]) => item !== undefined));
}

function normalizeProfile(value, { requireName = false } = {}) {
  assert(isObject(value), 'Perfil inválido.');
  const profile = {};
  if (value.name !== undefined && value.name !== null) {
    assert(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.trim().length <= 60, 'El nombre del perfil es obligatorio (máx. 60 caracteres).');
    profile.name = value.name.trim();
  } else if (requireName) throw new ApiError(400, 'El nombre del perfil es obligatorio.');
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
    quantityText: product.quantity || undefined, image: product.image_front_small_url || product.image_small_url || undefined,
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
  const profiles = tracking.collection('profiles');
  const entries = tracking.collection('entries');
  const goals = tracking.collection('goals');
  const sessions = new Map();
  const env = options.env || process.env;
  const production = env.NODE_ENV === 'production';
  const password = env.APP_PASSWORD;
  // Explicit deployment contract: only the authenticated Cloudflare tunnel can
  // reach the origin. Do not enable this mode on a published origin port.
  const gatewayAuth = env.AUTH_MODE === 'cloudflare';
  const accessTeamDomain = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessAudience = env.CF_ACCESS_AUD;
  // Verifying the Access assertion turns a silent exposure into a 403 if the
  // edge policy is ever removed. Without both settings the origin keeps
  // trusting the tunnel, so an incomplete configuration cannot lock anybody out.
  const accessEnforced = Boolean(gatewayAuth && accessTeamDomain && accessAudience);
  const accessCertsUrl = env.CF_ACCESS_CERTS_URL || (accessTeamDomain ? `https://${accessTeamDomain}/cdn-cgi/access/certs` : undefined);
  if (gatewayAuth && !accessEnforced) console.warn('AUTH_MODE=cloudflare sin CF_ACCESS_TEAM_DOMAIN y CF_ACCESS_AUD: el origen confía en cualquier petición que le llegue.');
  let accessKeys = { fetchedAt: 0, keys: new Map() };
  const bypass = !production && env.DEV_AUTH_BYPASS === '1';
  const sessionSecret = env.SESSION_SECRET || crypto.randomBytes(32).toString('base64url');
  const configuredOrigin = env.APP_ORIGIN?.replace(/\/$/, '');
  const offUserAgent = env.OFF_USER_AGENT || 'nutri-diary/0.1 (personal diary)';
  const foodAi = createFoodAi({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, client: options.openaiClient });
  const offQueues = {
    search: { last: 0, chain: Promise.resolve(), interval: OFF_SEARCH_INTERVAL_MS },
    product: { last: 0, chain: Promise.resolve(), interval: OFF_PRODUCT_INTERVAL_MS },
  };
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
  async function accessPublicKey(kid) {
    if (Date.now() - accessKeys.fetchedAt < ACCESS_CERTS_TTL_MS && accessKeys.keys.has(kid)) return accessKeys.keys.get(kid);
    const response = await fetch(accessCertsUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new ApiError(503, 'No se ha podido comprobar el acceso.');
    const payload = await response.json();
    const keys = new Map();
    for (const jwk of payload.keys || []) {
      try { keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); } catch { /* Ignore keys this runtime cannot read. */ }
    }
    accessKeys = { fetchedAt: Date.now(), keys };
    return keys.get(kid);
  }
  /** Validates the assertion Cloudflare Access attaches to every allowed request. */
  async function accessIdentity(req) {
    const token = req.get('cf-access-jwt-assertion') || parseCookies(req.headers.cookie).CF_Authorization;
    if (typeof token !== 'string') return null;
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return null;
    let header;
    let payload;
    try {
      header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    } catch { return null; }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const key = await accessPublicKey(header.kid);
    if (!key) return null;
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), key, Buffer.from(signaturePart, 'base64url'))) return null;
    const now = Math.floor(Date.now() / 1_000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
    if (payload.iss !== `https://${accessTeamDomain}`) return null;
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.includes(accessAudience)) return null;
    return payload;
  }
  const authenticated = async (req) => {
    if (accessEnforced) return Boolean(await accessIdentity(req));
    if (gatewayAuth) return true;
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
    authenticated(req).then((ok) => {
      if (ok) return next();
      if (accessEnforced) return next(new ApiError(403, 'Acceso no autorizado.'));
      if (!password && !bypass) return next(new ApiError(503, 'La autenticación no está configurada.'));
      return next(new ApiError(401, 'Autenticación requerida.'));
    }, next);
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
    if (gatewayAuth) return res.json({ authenticated: true, provider: 'cloudflare' });
    if (!password) return next(new ApiError(503, 'La autenticación no está configurada.'));
    if (!allowLoginAttempt(req)) return next(new ApiError(429, 'Demasiados intentos. Inténtalo más tarde.'));
    if (!constantTimeEquals(password, req.body?.password)) return next(new ApiError(401, 'Contraseña incorrecta.'));
    issueSession(res);
    return res.json({ authenticated: true });
  });
  app.get('/api/session', (req, res, next) => {
    authenticated(req).then((ok) => res.json({ authenticated: ok, provider: gatewayAuth ? 'cloudflare' : 'password' }), next);
  });
  app.post('/api/logout', requireSameOrigin, (req, res) => {
    const id = parseCookies(req.headers.cookie).nutri_session?.split('.')[0];
    if (id) sessions.delete(id);
    res.clearCookie('nutri_session', { httpOnly: true, sameSite: 'strict', secure: production, path: '/' });
    res.json({ ok: true });
  });
  app.use('/api', requireSameOrigin, requireAuth);

  app.post('/api/foods/ai', async (req, res, next) => {
    try {
      const request = normalizeFoodAiRequest(req.body);
      res.json(await foodAi.enrich(request));
    } catch (error) {
      if (error instanceof FoodAiError) return next(new ApiError(error.status, error.message));
      return next(error);
    }
  });

  /** Profiles. One diary per person; the food catalog is shared between them. */
  let bootstrapping = null;
  function ensureDefaultProfile() {
    // Concurrent first requests would otherwise each create their own profile.
    if (!bootstrapping) bootstrapping = createDefaultProfile().finally(() => { bootstrapping = null; });
    return bootstrapping;
  }
  async function createDefaultProfile() {
    const existing = await profiles.find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).limit(1).toArray();
    if (existing[0]) return existing[0];
    const legacy = publicDocument(await profileCollection.findOne({ key: 'primary' }))?.value;
    const created = { id: crypto.randomUUID(), name: 'Perfil 1', ...defaultProfile(), ...(legacy || {}), createdAt: new Date() };
    created.kcal = macroCalories(created);
    await profiles.insertOne({ ...created });
    await Promise.all([
      entries.updateMany({ profileId: { $exists: false } }, { $set: { profileId: created.id } }),
      goals.updateMany({ profileId: { $exists: false } }, { $set: { profileId: created.id } }),
    ]);
    return publicDocument(created);
  }
  async function resolveProfileId(req) {
    const requested = req.query.profile ?? req.body?.profileId;
    if (requested !== undefined && requested !== null && requested !== '') {
      assert(isUuid(requested), 'Perfil inválido.');
      const found = await profiles.findOne({ id: requested }, { projection: { _id: 0, id: 1 } });
      if (!found) throw new ApiError(404, 'Perfil no encontrado.');
      return requested;
    }
    return (await ensureDefaultProfile()).id;
  }
  async function saveProfile(id, body) {
    const profile = normalizeProfile(body);
    const effectiveDate = body.effectiveDate || localDate();
    assert(typeof effectiveDate === 'string' && validDate(effectiveDate), 'Fecha efectiva inválida.');
    const current = await profiles.findOne({ id }, { projection: { _id: 0 } });
    if (!current) throw new ApiError(404, 'Perfil no encontrado.');
    const saved = { ...current, ...profile, id };
    const unset = {};
    for (const key of ['weight', 'height', 'age']) if (body[key] === null) { delete saved[key]; unset[key] = ''; }
    await profiles.updateOne({ id }, { $set: { ...saved, updatedAt: new Date() }, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    await goals.updateOne({ profileId: id, effectiveDate }, { $set: { profileId: id, effectiveDate, ...profile, updatedAt: new Date() } }, { upsert: true });
    return saved;
  }

  app.get('/api/profiles', async (req, res) => {
    await ensureDefaultProfile();
    res.json(await profiles.find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray());
  });
  app.post('/api/profiles', async (req, res) => {
    const profile = normalizeProfile(req.body, { requireName: true });
    const effectiveDate = req.body.effectiveDate || localDate();
    assert(typeof effectiveDate === 'string' && validDate(effectiveDate), 'Fecha efectiva inválida.');
    const requestedId = req.body?.id;
    if (requestedId !== undefined) assert(isUuid(requestedId), 'El id del perfil debe ser un UUID.');
    if (requestedId) {
      const existing = await profiles.findOne({ id: requestedId }, { projection: { _id: 0 } });
      if (existing) return res.json(existing);
    }
    const created = { id: requestedId || crypto.randomUUID(), ...profile, createdAt: new Date() };
    if ((await profiles.countDocuments({}, { limit: 20 })) >= 12) throw new ApiError(400, 'Has alcanzado el máximo de perfiles.');
    await profiles.insertOne({ ...created });
    await goals.updateOne({ profileId: created.id, effectiveDate }, { $set: { profileId: created.id, effectiveDate, ...profile, updatedAt: new Date() } }, { upsert: true });
    res.status(201).json(publicDocument(created));
  });
  app.put('/api/profiles/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'Perfil inválido.');
    res.json(publicDocument(await saveProfile(req.params.id, req.body)));
  });
  app.delete('/api/profiles/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'Perfil inválido.');
    const total = await profiles.countDocuments();
    if (total <= 1) throw new ApiError(400, 'No puedes eliminar el único perfil.');
    await profiles.deleteOne({ id: req.params.id });
    await Promise.all([entries.deleteMany({ profileId: req.params.id }), goals.deleteMany({ profileId: req.params.id })]);
    res.json({ ok: true });
  });
  // Legacy single-profile endpoints, kept so older clients and exports keep working.
  app.get('/api/profile', async (req, res) => res.json(publicDocument(await ensureDefaultProfile())));
  app.put('/api/profile', async (req, res) => {
    const id = await resolveProfileId(req);
    res.json(publicDocument(await saveProfile(id, req.body)));
  });

  app.get('/api/foods', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = query ? { $or: [{ name: { $regex: escapedQuery, $options: 'i' } }, { brand: { $regex: escapedQuery, $options: 'i' } }, { barcode: { $regex: escapedQuery, $options: 'i' } }] } : {};
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    assert(Number.isInteger(limit) && limit > 0 && limit <= 500, 'Límite inválido.');
    const [result, total] = await Promise.all([
      foods.find(filter, { projection: { _id: 0 } }).sort({ favorite: -1, name: 1 }).limit(limit).toArray(),
      foods.countDocuments(filter),
    ]);
    // The catalogue outgrows a single page eventually; the client has to know
    // when what it holds is a page rather than the whole library.
    res.set('X-Total-Count', String(total));
    res.json(result);
  });
  app.get('/api/foods/count', async (req, res) => res.json({ total: await foods.countDocuments() }));
  app.post('/api/foods', async (req, res) => {
    const requestedId = req.body?.id;
    const food = normalizeFood(req.body, { requireId: requestedId !== undefined });
    if (food.id) {
      const existing = await foods.findOne({ id: food.id });
      if (existing) return res.json(publicDocument(existing));
    }
    const created = { ...food, id: food.id || crypto.randomUUID() };
    try { await foods.insertOne(created); } catch (error) {
      if (error?.code === 11000 && created.id) return res.json(publicDocument(await foods.findOne({ id: created.id })));
      throw error;
    }
    res.status(201).json(created);
  });
  app.patch('/api/foods/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'El id del alimento debe ser un UUID.');
    const current = await foods.findOne({ id: req.params.id });
    if (!current) throw new ApiError(404, 'Alimento no encontrado.');
    const food = normalizeFood({ ...publicDocument(current), ...req.body, id: req.params.id }, { requireId: true });
    await foods.updateOne({ id: food.id }, { $set: food });
    res.json(food);
  });

  async function offFetch(url, kind = 'search') {
    const queue = offQueues[kind];
    const task = async () => {
      const wait = queue.interval - (Date.now() - queue.last);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      queue.last = Date.now();
      const response = await fetch(url, { headers: { 'User-Agent': offUserAgent }, signal: AbortSignal.timeout(10_000) });
      // A 404 is a real answer: the product is simply not catalogued there.
      if (response.status === 404) return null;
      if (!response.ok) throw new ApiError(502, 'Open Food Facts no está disponible.');
      return response.json();
    };
    const pending = queue.chain.then(task, task);
    queue.chain = pending.catch(() => {});
    return pending;
  }
  /** search.openfoodfacts.org spells a few fields differently from the product
   *  endpoint, so its hits are reshaped before the shared mapper sees them. */
  const fromSearchHit = (hit) => fromOff({
    ...hit,
    brands: Array.isArray(hit.brands) ? hit.brands.join(', ') : hit.brands,
    quantity: Array.isArray(hit.quantity) ? hit.quantity[0] : hit.quantity,
  });
  /** Open Food Facts products for one barcode. Barcodes are reused between
   *  different products, so this returns every match rather than the first. */
  async function offByBarcode(barcode) {
    const cached = await lookupCache.findOne({ barcode, expiresAt: { $gt: new Date() } });
    if (Array.isArray(cached?.foods)) return cached.foods;
    // Two independent sources: the search index lists every product sharing the
    // code, the product endpoint is canonical and knows codes indexed later.
    // Either may be rate limited on its own, so one failure must not hide the
    // other, and only a total failure counts as an outage.
    const attempts = await Promise.allSettled([
      (async () => {
        const url = new URL('https://search.openfoodfacts.org/search');
        url.search = new URLSearchParams({ q: `code:${barcode}`, page_size: '20' });
        return ((await offFetch(url, 'search'))?.hits || []).map(fromSearchHit);
      })(),
      (async () => {
        const payload = await offFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`, 'product');
        return payload?.status === 1 && payload.product ? [fromOff(payload.product)] : [];
      })(),
    ]);
    if (attempts.every((attempt) => attempt.status === 'rejected')) throw attempts[0].reason;
    // The two sources spell brands differently for the same product, so within
    // one barcode the product name is the identity. Genuinely different
    // products sharing a code carry different names, which is the case worth
    // showing. Duplicates merge so the richer brand and image survive.
    const byName = new Map();
    for (const attempt of attempts) {
      if (attempt.status !== 'fulfilled') continue;
      for (const food of attempt.value) {
        const key = food.name.toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
        const current = byName.get(key);
        if (!current) { byName.set(key, { ...food, barcode: food.barcode || barcode }); continue; }
        if ((food.brand || '').length > (current.brand || '').length) current.brand = food.brand;
        current.image = current.image || food.image;
        current.quantityText = current.quantityText || food.quantityText;
      }
    }
    const result = [...byName.values()];
    // An unknown barcode may be added upstream any day, so remember it briefly only.
    const ttl = result.length ? OFF_CACHE_MS : OFF_MISS_CACHE_MS;
    await lookupCache.updateOne({ barcode }, { $set: { barcode, foods: result, expiresAt: new Date(Date.now() + ttl) } }, { upsert: true });
    return result;
  }
  /** Text search goes through search.openfoodfacts.org: the legacy cgi/search.pl
   *  answers 503 to server-to-server traffic. Its hits spell some fields
   *  differently, so they are normalised before reusing the product mapper. */
  async function offBySearch(query) {
    const cacheKey = query.toLocaleLowerCase('es');
    const cached = await searchCache.findOne({ cacheKey, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, foods: 1 } });
    if (cached?.foods) return cached.foods;
    const url = new URL('https://search.openfoodfacts.org/search');
    url.search = new URLSearchParams({ q: query, page_size: '20' });
    const payload = await offFetch(url, 'search');
    const result = (payload?.hits || []).map(fromSearchHit);
    await searchCache.updateOne({ cacheKey }, { $set: { cacheKey, foods: result, expiresAt: new Date(Date.now() + OFF_CACHE_MS) } }, { upsert: true });
    return result;
  }
  const myFoods = (filter) => foods.find(filter, { projection: { _id: 0 } }).sort({ favorite: -1, name: 1 }).limit(25).toArray();

  app.get('/api/lookup/:barcode', async (req, res) => {
    const barcode = req.params.barcode;
    assert(/^[0-9]{6,14}$/.test(barcode), 'Código de barras inválido.');
    const mine = await myFoods({ barcode });
    let external = [];
    let externalError;
    try { external = await offByBarcode(barcode); } catch (error) { externalError = error.message || 'Open Food Facts no está disponible.'; }
    res.json({ barcode, mine, external, ...(externalError ? { externalError } : {}) });
  });
  app.get('/api/search', async (req, res) => {
    const provider = req.query.provider || 'off';
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    assert(query.length >= 2 && query.length <= 100, 'La búsqueda debe tener entre 2 y 100 caracteres.');
    assert(['off', 'none'].includes(provider), 'Proveedor de búsqueda inválido.');
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mine = await myFoods({ $or: [{ name: { $regex: escaped, $options: 'i' } }, { brand: { $regex: escaped, $options: 'i' } }, { barcode: { $regex: escaped, $options: 'i' } }] });
    const isBarcode = /^[0-9]{6,14}$/.test(query);
    let external = [];
    let externalError;
    if (provider !== 'none') {
      try { external = isBarcode ? await offByBarcode(query) : await offBySearch(query); }
      catch (error) { externalError = error.message || 'La búsqueda externa no está disponible.'; }
    }
    res.json({ mine, external, ...(externalError ? { externalError } : {}) });
  });

  app.delete('/api/foods/:id', async (req, res) => {
    assert(isUuid(req.params.id), 'El id del alimento debe ser un UUID.');
    await foods.deleteOne({ id: req.params.id });
    res.json({ ok: true });
  });

  /** What this profile uses most often for this meal, one row per food. The
   *  latest quantity is kept for the quick-add action; the usage count is an
   *  ordering detail and is not presented by the client. */
  app.get('/api/entries/recent', async (req, res) => {
    const meal = req.query.meal;
    if (meal !== undefined) assert(MEALS.has(meal), 'Comida inválida.');
    const limit = req.query.limit === undefined ? 8 : Number(req.query.limit);
    assert(Number.isInteger(limit) && limit > 0 && limit <= 25, 'Límite inválido.');
    const profileId = await resolveProfileId(req);
    const rows = await entries.aggregate([
      { $match: { profileId, ...(meal ? { meal } : {}) } },
      { $sort: { date: -1, createdAt: -1, id: -1 } },
      { $group: {
        _id: { $ifNull: ['$food.id', { $concat: [{ $ifNull: ['$food.name', ''] }, '|', { $ifNull: ['$food.brand', ''] }] }] },
        food: { $first: '$food' },
        quantity: { $first: '$quantity' },
        date: { $first: '$date' },
        usageCount: { $sum: 1 },
      } },
      { $sort: { usageCount: -1, date: -1, _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, food: 1, quantity: 1, date: 1, usageCount: 1 } },
    ]).toArray();
    res.json(rows);
  });

  app.get('/api/entries', async (req, res) => {
    const date = req.query.date;
    assert(typeof date === 'string' && validDate(date), 'Fecha inválida.');
    const profileId = await resolveProfileId(req);
    const rows = await entries.find({ date, profileId }, { projection: { _id: 0, totals: 0 } }).toArray();
    rows.sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id));
    res.json(rows.map(({ createdAt, ...row }) => row));
  });
  app.post('/api/entries', async (req, res) => {
    const entry = normalizeEntry(req.body);
    const profileId = await resolveProfileId(req);
    const existing = await entries.findOne({ id: entry.id }, { projection: { _id: 0, totals: 0, createdAt: 0 } });
    if (existing) return res.json(existing);
    const stored = { ...entry, profileId, food: clone(entry.food), totals: scaleNutrients(entry.food.nutrients, entry.quantity), createdAt: new Date() };
    try { await entries.insertOne(stored); } catch (error) {
      if (error?.code === 11000) return res.json(await entries.findOne({ id: entry.id }, { projection: { _id: 0, totals: 0, createdAt: 0 } }));
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
    const { totals, _id, createdAt, ...result } = entry;
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
    const profileId = await resolveProfileId(req);
    const [entryRows, goalRows] = await Promise.all([
      entries.find({ profileId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).toArray(),
      goals.find({ profileId, effectiveDate: { $lte: to } }, { projection: { _id: 0 } }).sort({ effectiveDate: 1 }).toArray(),
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
    await ensureDefaultProfile();
    const [allProfiles, allFoods, allEntries, allGoals] = await Promise.all([
      profiles.find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray(), foods.find({}, { projection: { _id: 0 } }).toArray(), entries.find({}, { projection: { _id: 0 } }).toArray(), goals.find({}, { projection: { _id: 0 } }).sort({ effectiveDate: 1 }).toArray(),
    ]);
    res.json({ profiles: allProfiles, profile: allProfiles[0] || defaultProfile(), foods: allFoods, entries: allEntries.map(publicDocument), goals: allGoals });
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
  const catalog = client.db('nutrition_catalog');
  const tracking = client.db('nutrition_tracking');
  // Barcodes are reused across different products, so the personal catalog no
  // longer treats them as unique. Drop the old unique index if it is still there.
  await dropIndex(catalog.collection('foods'), 'barcode_unique');
  await dropIndex(tracking.collection('goals'), 'effectiveDate_1');
  await Promise.all([
    catalog.collection('foods').createIndex({ id: 1 }, { unique: true }),
    catalog.collection('foods').createIndex({ barcode: 1 }),
    catalog.collection('foods').createIndex({ name: 1 }),
    catalog.collection('lookup_cache').createIndex({ barcode: 1 }, { unique: true }),
    catalog.collection('lookup_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    catalog.collection('search_cache').createIndex({ cacheKey: 1 }, { unique: true }),
    catalog.collection('search_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    tracking.collection('profiles').createIndex({ id: 1 }, { unique: true }),
    tracking.collection('profiles').createIndex({ createdAt: 1 }),
    tracking.collection('entries').createIndex({ id: 1 }, { unique: true }),
    tracking.collection('entries').createIndex({ profileId: 1, date: 1 }),
    tracking.collection('entries').createIndex({ profileId: 1, meal: 1, date: -1 }),
    tracking.collection('goals').createIndex({ profileId: 1, effectiveDate: 1 }, { unique: true }),
  ]);
}

async function dropIndex(collection, name) {
  try { await collection.dropIndex(name); } catch { /* index absent: nothing to drop */ }
}
