// BAIL'S Cricket Ground: website + admin API
// Storage: a single JSON file (data/db.json), seeded from data/seed.json on first run.
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SEED_FILE = path.join(__dirname, 'data', 'seed.json');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 12;

if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(9).toString('base64url');
  console.warn(`\n[!] ADMIN_PASSWORD not set. Temporary admin password for this run: ${ADMIN_PASSWORD}\n    Set ADMIN_PASSWORD in .env to make it permanent.\n`);
}

// ---------------------------------------------------------------- store
let db;
let writeChain = Promise.resolve();

async function loadDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    db = JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    db = JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
    await saveDb();
  }
  for (const k of ['honours', 'events', 'media', 'instagram', 'bookings']) db[k] ??= [];
  db.settings ??= {};
}

function saveDb() {
  writeChain = writeChain.then(async () => {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, DB_FILE);
  });
  return writeChain;
}

// ---------------------------------------------------------------- validation
const URL_RE = /^(https:\/\/[^\s"'<>]+|\/(uploads|assets)\/[\w./-]+)$/;
const str = (max, req = false) => ({ t: 'str', max, req });
const int = (min, max) => ({ t: 'int', min, max });

const SCHEMAS = {
  honours: {
    type: { t: 'enum', v: ['century', 'fivefor'], req: true },
    player: str(80, true),
    team: str(80),
    versus: str(80),
    tournament: str(120),
    date: { t: 'date', req: true },
    format: str(40),
    runs: int(0, 500),
    balls: int(0, 600),
    fours: int(0, 100),
    sixes: int(0, 100),
    notOut: { t: 'bool' },
    wickets: int(0, 10),
    runsConceded: int(0, 300),
    overs: { t: 'str', max: 5, re: /^\d{1,2}(\.[0-5])?$/ },
    notes: str(500),
    photo: { t: 'url' },
    link: { t: 'url' },
  },
  events: {
    title: str(140, true),
    kind: { t: 'enum', v: ['tournament', 'match', 'event'], req: true },
    tournament: str(140),
    round: str(80),
    teamA: str(100),
    teamB: str(100),
    start: { t: 'datetime', req: true },
    end: { t: 'date' },
    format: str(40),
    description: str(1500),
    link: { t: 'url' },
    poster: { t: 'url' },
    flyer: { t: 'url' },
    bracket: { t: 'url' },
    fee: str(160),
    contact: str(200),
    highlights: str(1500),
    tentative: { t: 'bool' },
    featured: { t: 'bool' },
  },
  // Calendar blockings: a date plus a slot (full day, or slot 1, 2 or 3)
  bookings: {
    date: { t: 'date', req: true },
    slot: { t: 'enum', v: ['full', 's1', 's2', 's3'], req: true },
    category: { t: 'enum', v: ['hca', 'tournament', 'private', 'practice', 'maintenance', 'other'], req: true },
    label: str(100),
    note: str(300), // admin-only, never sent to the public site
  },
  media: {
    kind: { t: 'enum', v: ['image', 'video'], req: true },
    src: { t: 'url', req: true },
    thumb: { t: 'url' },
    caption: str(200),
    featured: { t: 'bool' },
  },
  instagram: {
    url: { t: 'url', req: true, re: /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/?(\?.*)?$/ },
    caption: str(200),
  },
};

const SETTINGS_SCHEMA = {
  instagramUrl: { t: 'url' },
  facebookUrl: { t: 'url' },
  youtubeUrl: { t: 'url' },
  gwSportsUrl: { t: 'url', re: /^https:\/\/(www\.)?gwsportsapp\.in\/\S*$/ },
  phone1: str(24),
  phone2: str(24),
  whatsapp: { t: 'str', max: 15, re: /^\d{10,15}$/ },
  contacts: str(400),
  announcement: str(240),
  bookingNote: str(400),
};

function clean(schema, input, partial = false) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Invalid body');
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    let v = input[key];
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (rule.req && !partial) throw httpError(400, `"${key}" is required`);
      if (v !== undefined) out[key] = rule.t === 'bool' ? false : '';
      continue;
    }
    switch (rule.t) {
      case 'str':
        v = String(v).trim();
        if (v.length > rule.max) throw httpError(400, `"${key}" is too long (max ${rule.max})`);
        if (rule.re && !rule.re.test(v)) throw httpError(400, `"${key}" has an invalid format`);
        break;
      case 'int':
        v = Number(v);
        if (!Number.isInteger(v) || v < rule.min || v > rule.max) throw httpError(400, `"${key}" must be a whole number ${rule.min}–${rule.max}`);
        break;
      case 'bool':
        v = v === true || v === 'true' || v === 'on' || v === 1;
        break;
      case 'enum':
        if (!rule.v.includes(v)) throw httpError(400, `"${key}" must be one of ${rule.v.join(', ')}`);
        break;
      case 'date':
        v = String(v);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw httpError(400, `"${key}" must be a date (YYYY-MM-DD)`);
        break;
      case 'datetime': // stored as IST wall-clock "YYYY-MM-DDTHH:mm"
        v = String(v).slice(0, 16);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || Number.isNaN(Date.parse(v + ':00+05:30'))) throw httpError(400, `"${key}" must be a date and time`);
        break;
      case 'url':
        v = String(v).trim();
        if (!URL_RE.test(v)) throw httpError(400, `"${key}" must be an https:// link or an uploaded file`);
        if (rule.re && !rule.re.test(v)) throw httpError(400, `"${key}" is not a valid link for this field`);
        break;
    }
    out[key] = v;
  }
  return out;
}

function validateHonour(h) {
  if (h.type === 'century') {
    if (!(h.runs >= 100)) throw httpError(400, 'A century needs runs of 100 or more');
  } else if (h.type === 'fivefor') {
    if (!(h.wickets >= 5)) throw httpError(400, 'A five-wicket haul needs 5 or more wickets');
    if (h.runsConceded === undefined || h.runsConceded === '') throw httpError(400, '"runsConceded" is required for a five-wicket haul');
  }
}

const SLOT_PARTS = { full: ['s1', 's2', 's3'], s1: ['s1'], s2: ['s2'], s3: ['s3'] };
function validateBooking(b, ignoreId) {
  const clash = db.bookings.find((x) => x.id !== ignoreId && x.date === b.date
    && SLOT_PARTS[x.slot].some((p) => SLOT_PARTS[b.slot].includes(p)));
  if (clash) throw httpError(409, `${b.date} (${b.slot === 'full' ? 'full day' : b.slot}) is already blocked${clash.label ? `: ${clash.label}` : ''}`);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------------------------------------------------------------- auth
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function requireAdmin(req, res, next) {
  const session = verify(getCookie(req, 'bails_admin'));
  if (!session) return res.status(401).json({ error: 'Please sign in' });
  req.admin = session;
  next();
}

const loginAttempts = new Map(); // ip -> { count, first }
function loginLimited(ip) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > 15 * 60 * 1000) {
    loginAttempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > 10;
}

// ---------------------------------------------------------------- uploads
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (MIME_EXT[file.mimetype] ? cb(null, true) : cb(httpError(400, 'Only JPG, PNG, WebP, GIF, MP4, WebM or MOV files are allowed'))),
});

// ---------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "script-src 'self' https://www.instagram.com https://platform.instagram.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      'frame-src https://www.google.com https://maps.google.com https://www.instagram.com https://www.facebook.com',
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.json({ limit: '200kb' }));

// Public data for the website
app.get('/api/public', (req, res) => {
  const byStart = (a, b) => a.start.localeCompare(b.start);
  res.set('Cache-Control', 'no-cache');
  res.json({
    settings: db.settings,
    events: [...db.events].sort(byStart),
    honours: [...db.honours].sort((a, b) => b.date.localeCompare(a.date)),
    media: db.media,
    instagram: db.instagram,
    bookings: db.bookings.map(({ note, ...b }) => b).sort((a, b) => a.date.localeCompare(b.date)),
    isAdmin: Boolean(verify(getCookie(req, 'bails_admin'))),
  });
});

// Admin-only view of the data (includes private booking notes)
app.get('/api/admin-data', requireAdmin, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...db });
});

// Auth
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (loginLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const { username, password } = req.body || {};
  if (!safeEqual(username || '', ADMIN_USER) || !safeEqual(password || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  loginAttempts.delete(ip);
  const token = sign({ u: ADMIN_USER, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `bails_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`);
  res.json({ ok: true, user: ADMIN_USER });
});

app.post('/api/logout', (_req, res) => {
  res.set('Set-Cookie', 'bails_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', requireAdmin, (req, res) => res.json({ user: req.admin.u }));

// Admin: settings
app.put('/api/settings', requireAdmin, async (req, res) => {
  db.settings = { ...db.settings, ...clean(SETTINGS_SCHEMA, req.body, true) };
  await saveDb();
  res.json(db.settings);
});

// Admin: uploads
app.post('/api/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) throw httpError(400, 'No file received');
  res.json({ url: `/uploads/${req.file.filename}`, type: req.file.mimetype });
});

// Admin: CRUD for collections
function collection(req) {
  const name = req.params.collection;
  if (!SCHEMAS[name]) throw httpError(404, 'Unknown collection');
  return name;
}

app.post('/api/:collection', requireAdmin, async (req, res) => {
  const name = collection(req);
  const item = clean(SCHEMAS[name], req.body);
  if (name === 'honours') validateHonour(item);
  if (name === 'bookings') validateBooking(item);
  item.id = crypto.randomUUID();
  item.createdAt = new Date().toISOString();
  db[name].push(item);
  await saveDb();
  res.status(201).json(item);
});

app.put('/api/:collection/:id', requireAdmin, async (req, res) => {
  const name = collection(req);
  const idx = db[name].findIndex((x) => x.id === req.params.id);
  if (idx === -1) throw httpError(404, 'Not found');
  const merged = { ...db[name][idx], ...clean(SCHEMAS[name], req.body, true), updatedAt: new Date().toISOString() };
  clean(SCHEMAS[name], merged); // re-check required fields on the merged record
  if (name === 'honours') validateHonour(merged);
  if (name === 'bookings') validateBooking(merged, merged.id);
  db[name][idx] = merged;
  await saveDb();
  res.json(merged);
});

app.delete('/api/:collection/:id', requireAdmin, async (req, res) => {
  const name = collection(req);
  const before = db[name].length;
  db[name] = db[name].filter((x) => x.id !== req.params.id);
  if (db[name].length === before) throw httpError(404, 'Not found');
  await saveDb();
  res.json({ ok: true });
});

// Reorder media (gallery order)
app.post('/api/media-order', requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const map = new Map(db.media.map((m) => [m.id, m]));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean);
  const rest = db.media.filter((m) => !ids.includes(m.id));
  db.media = [...ordered, ...rest];
  await saveDb();
  res.json({ ok: true });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Static site
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Errors
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

await loadDb();
if (!fss.existsSync(path.join(__dirname, 'public', 'index.html'))) console.warn('public/index.html missing');
app.listen(PORT, () => console.log(`BAIL'S Cricket Ground site running at http://localhost:${PORT}  (admin: /admin)`));
