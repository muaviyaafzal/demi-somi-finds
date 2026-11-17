/**
 * server.js — Demi Somi Finds
 *
 * ONE service: the same Express server serves the public storefront,
 * the admin panel, and the JSON API. Data lives in a single SQLite
 * file (./data/store.db) and uploads in ./data/uploads, so every
 * visitor sees the same live products and admin edits persist for all.
 *
 * Run locally:  npm install && npm run seed && npm start
 * Then open:    http://localhost:3000        (store)
 *               http://localhost:3000/admin  (admin panel)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

/* ------------------------------------------------------------------ */
/* Tiny .env loader (no extra dependency)                              */
/* ------------------------------------------------------------------ */
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// JWT secret: must come from the environment in production. If it is not
// set, generate a random one for this run and warn loudly — admins will
// simply be logged out when the server restarts.
let JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[security] JWT_SECRET is not set — using a random secret for this run. ' +
    'Set JWT_SECRET in your environment (see .env.example) so admin logins survive restarts.'
  );
}

// Optional image processing. sharp is an optionalDependency: if it cannot
// be installed on the host, uploads still work (validated, original file).
let sharp = null;
try {
  sharp = require('sharp');
  console.log('[uploads] sharp available — images will be resized/compressed.');
} catch {
  console.log('[uploads] sharp not available — uploads are validated and stored as-is.');
}

const {
  db,
  UPLOAD_DIR,
  getSetting,
  setSetting,
  getAllSettings,
  getJsonSetting,
  getVisibleProducts,
  getAllProducts,
  getProduct,
  toProduct,
} = require('./db');
const { seed } = require('./seed');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ */
/* Security headers (helmet)                                           */
/* ------------------------------------------------------------------ */
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */
// Login: slow down brute-force guessing (per IP).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});
// General API: generous, just to stop abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isNonEmptyString(v, max = 500) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isValidHttpUrl(v) {
  if (typeof v !== 'string' || v.trim() === '') return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Password rules for the owner's own credentials (also enforced in the UI). */
function validateNewPassword(pw) {
  if (typeof pw !== 'string') return 'Password must be text.';
  if (pw.length < 10) return 'Password must be at least 10 characters long.';
  if (pw.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(pw)) {
    return 'Password must include a special character.';
  }
  return null;
}

function signToken(user, scope) {
  return jwt.sign(
    { sub: user.id, username: user.username, scope },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
}

/** Require a valid admin JWT. `req.adminUser` and `req.tokenScope` are set. */
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.sub);
  if (!user || user.username !== payload.username) {
    return res.status(401).json({ error: 'Account no longer exists. Please sign in again.' });
  }
  req.adminUser = user;
  req.tokenScope = payload.scope || 'admin';
  next();
}

/** Only full admin tokens (not the first-login "must-change" token). */
function requireFullAdmin(req, res, next) {
  if (req.tokenScope !== 'admin') {
    return res.status(403).json({ error: 'Please finish setting your own credentials first.' });
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => res.json({ ok: true }));

/** Public store settings (safe for visitors: no secrets live here). */
app.get('/api/settings', apiLimiter, (req, res) => {
  const s = getAllSettings();
  res.json({
    store_name: s.store_name || 'Demi Somi Finds',
    theme: THEMES.includes(s.theme) ? s.theme : 'lavender',
    tagline: s.tagline || '',
    hero_headline: s.hero_headline || '',
    hero_subheadline: s.hero_subheadline || '',
    announcement_text: s.announcement_text || '',
    announcement_enabled: s.announcement_enabled === '1',
    about_text: s.about_text || '',
    contact_email: s.contact_email || '',
    currency: s.currency || '$',
    trust_badges: getJsonSetting('trust_badges', []),
    disclosure_text: s.disclosure_text || '',
    disclosure_enabled: s.disclosure_enabled === '1',
    social: {
      facebook: s.social_facebook || '',
      tiktok: s.social_tiktok || '',
      instagram: s.social_instagram || '',
      youtube: s.social_youtube || '',
    },
  });
});

/** Visible products, in display order. */
app.get('/api/products', apiLimiter, (req, res) => {
  res.json(getVisibleProducts());
});

/** One visible product (for the detail modal). */
app.get('/api/products/:id', apiLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id.' });
  const product = getProduct(id);
  if (!product || !product.visible) return res.status(404).json({ error: 'Product not found.' });
  res.json(product);
});

/* ------------------------------------------------------------------ */
/* Admin auth                                                          */
/* ------------------------------------------------------------------ */
const LOCKOUT_AFTER_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!isNonEmptyString(username, 100) || typeof password !== 'string' || password === '') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare(
    'SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE'
  ).get(username.trim());
  // Generic error on purpose: do not reveal whether the username exists.
  const invalid = { error: 'Incorrect username or password.' };

  if (!user) return res.status(401).json(invalid);

  if (user.locked_until && user.locked_until > Date.now()) {
    const minutes = Math.ceil((user.locked_until - Date.now()) / 60000);
    return res.status(423).json({
      error: `Account locked after too many failed attempts. Try again in about ${minutes} minute(s).`,
    });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lockedUntil = attempts >= LOCKOUT_AFTER_ATTEMPTS
      ? Date.now() + LOCKOUT_MS
      : 0;
    db.prepare(
      'UPDATE admin_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?'
    ).run(attempts, lockedUntil, new Date().toISOString(), user.id);
    if (lockedUntil) {
      return res.status(423).json({
        error: 'Account locked after too many failed attempts. Try again in 15 minutes.',
      });
    }
    return res.status(401).json(invalid);
  }

  // Success: clear any failed-attempt record.
  db.prepare(
    'UPDATE admin_users SET failed_attempts = 0, locked_until = 0, updated_at = ? WHERE id = ?'
  ).run(new Date().toISOString(), user.id);

  if (user.must_change === 1) {
    // First login with demo credentials: limited token, forced change next.
    return res.json({
      token: signToken(user, 'must-change'),
      username: user.username,
      mustChangeCredentials: true,
    });
  }
  return res.json({
    token: signToken(user, 'admin'),
    username: user.username,
    mustChangeCredentials: false,
  });
});

/**
 * First-login forced credential change.
 * Accepts the limited "must-change" token (or a full token).
 * After saving, the demo credentials stop working permanently because
 * the stored username/password are replaced.
 */
app.post('/api/admin/change-credentials', requireAuth, (req, res) => {
  const { newUsername, newPassword } = req.body || {};
  if (!isNonEmptyString(newUsername, 60) || !/^[A-Za-z0-9._-]+$/.test(newUsername.trim())) {
    return res.status(400).json({
      error: 'Username must be 1–60 characters: letters, numbers, dot, underscore or hyphen.',
    });
  }
  const pwError = validateNewPassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  const taken = db.prepare(
    'SELECT id FROM admin_users WHERE username = ? COLLATE NOCASE AND id != ?'
  ).get(newUsername.trim(), req.adminUser.id);
  if (taken) return res.status(409).json({ error: 'That username is already taken.' });

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    'UPDATE admin_users SET username = ?, password_hash = ?, must_change = 0, ' +
    'failed_attempts = 0, locked_until = 0, updated_at = ? WHERE id = ?'
  ).run(newUsername.trim(), hash, new Date().toISOString(), req.adminUser.id);

  const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.adminUser.id);
  res.json({
    token: signToken(updated, 'admin'),
    username: updated.username,
    mustChangeCredentials: false,
  });
});

/** Change password from Account settings (full admin only). */
app.post('/api/admin/change-password', requireAuth, requireFullAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || currentPassword === '') {
    return res.status(400).json({ error: 'Current password is required.' });
  }
  const pwError = validateNewPassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });
  if (!bcrypt.compareSync(currentPassword, req.adminUser.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    'UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?'
  ).run(hash, new Date().toISOString(), req.adminUser.id);
  res.json({ ok: true });
});

/** Change username from Account settings (full admin only). */
app.post('/api/admin/change-username', requireAuth, requireFullAdmin, (req, res) => {
  const { newUsername } = req.body || {};
  if (!isNonEmptyString(newUsername, 60) || !/^[A-Za-z0-9._-]+$/.test(newUsername.trim())) {
    return res.status(400).json({
      error: 'Username must be 1–60 characters: letters, numbers, dot, underscore or hyphen.',
    });
  }
  const taken = db.prepare(
    'SELECT id FROM admin_users WHERE username = ? COLLATE NOCASE AND id != ?'
  ).get(newUsername.trim(), req.adminUser.id);
  if (taken) return res.status(409).json({ error: 'That username is already taken.' });
  db.prepare(
    'UPDATE admin_users SET username = ?, updated_at = ? WHERE id = ?'
  ).run(newUsername.trim(), new Date().toISOString(), req.adminUser.id);
  res.json({ username: newUsername.trim() });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ username: req.adminUser.username, mustChangeCredentials: req.adminUser.must_change === 1 });
});

/* ------------------------------------------------------------------ */
/* Admin: products (full CRUD)                                         */
/* ------------------------------------------------------------------ */
function validateProductInput(body) {
  const errors = [];
  if (!isNonEmptyString(body.name, 120)) errors.push('Name is required (max 120 characters).');
  if (body.title !== undefined && typeof body.title !== 'string') errors.push('Title must be text.');
  if (body.title && body.title.length > 120) errors.push('Title must be 120 characters or fewer.');
  if (body.description !== undefined && typeof body.description !== 'string') errors.push('Description must be text.');
  if (body.description && body.description.length > 2000) errors.push('Description must be 2000 characters or fewer.');
  const price = Number(body.price);
  if (body.price === undefined || Number.isNaN(price) || price < 0 || price > 99999) {
    errors.push('Price must be a number between 0 and 99999.');
  }
  if (!isNonEmptyString(body.category, 60)) errors.push('Category is required (max 60 characters).');
  if (body.buy_link && body.buy_link.trim() !== '' && !isValidHttpUrl(body.buy_link)) {
    errors.push('Buy link must be a full http(s) URL, or left empty.');
  }
  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length > 6) {
      errors.push('Images must be a list of at most 6 image URLs.');
    } else {
      for (const url of body.images) {
        if (typeof url !== 'string' || url.length > 2000) {
          errors.push('Each image must be a URL of 2000 characters or fewer.');
          break;
        }
        const okUrl = url.startsWith('/uploads/') || url.startsWith('data:image/') || isValidHttpUrl(url);
        if (!okUrl) { errors.push('Image URLs must be uploads, data URIs, or http(s) links.'); break; }
      }
    }
  }
  return { errors, price };
}

app.get('/api/admin/products', requireAuth, requireFullAdmin, (req, res) => {
  res.json(getAllProducts());
});

app.post('/api/admin/products', requireAuth, requireFullAdmin, (req, res) => {
  const { errors, price } = validateProductInput(req.body || {});
  if (errors.length > 0) return res.status(400).json({ error: errors[0] });
  const b = req.body;
  const now = new Date().toISOString();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM products').get().m;
  const info = db.prepare(
    'INSERT INTO products (name, title, description, price, category, buy_link, images, visible, sort_order, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    b.name.trim(),
    (b.title || '').trim(),
    (b.description || '').trim(),
    Math.round(price * 100) / 100,
    b.category.trim(),
    (b.buy_link || '').trim(),
    JSON.stringify(Array.isArray(b.images) ? b.images : []),
    b.visible === false || b.visible === 0 ? 0 : 1,
    maxOrder + 1,
    now, now
  );
  res.status(201).json(getProduct(info.lastInsertRowid));
});

app.put('/api/admin/products/:id', requireAuth, requireFullAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id.' });
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });

  // Merge with existing values so partial updates work.
  const merged = {
    name: req.body.name !== undefined ? req.body.name : existing.name,
    title: req.body.title !== undefined ? req.body.title : existing.title,
    description: req.body.description !== undefined ? req.body.description : existing.description,
    price: req.body.price !== undefined ? req.body.price : existing.price,
    category: req.body.category !== undefined ? req.body.category : existing.category,
    buy_link: req.body.buy_link !== undefined ? req.body.buy_link : existing.buy_link,
    images: req.body.images !== undefined ? req.body.images : existing.images,
    visible: req.body.visible !== undefined ? req.body.visible : existing.visible,
  };
  const { errors, price } = validateProductInput(merged);
  if (errors.length > 0) return res.status(400).json({ error: errors[0] });

  db.prepare(
    'UPDATE products SET name = ?, title = ?, description = ?, price = ?, category = ?, ' +
    'buy_link = ?, images = ?, visible = ?, updated_at = ? WHERE id = ?'
  ).run(
    String(merged.name).trim(),
    String(merged.title || '').trim(),
    String(merged.description || '').trim(),
    Math.round(price * 100) / 100,
    String(merged.category).trim(),
    String(merged.buy_link || '').trim(),
    JSON.stringify(Array.isArray(merged.images) ? merged.images : []),
    merged.visible === false || merged.visible === 0 ? 0 : 1,
    new Date().toISOString(),
    id
  );
  res.json(getProduct(id));
});

app.delete('/api/admin/products/:id', requireAuth, requireFullAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid product id.' });
  const existing = getProduct(id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });

  // Best-effort cleanup of uploaded image files used only by this product.
  for (const url of existing.images) {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      const file = path.join(UPLOAD_DIR, path.basename(url));
      if (file.startsWith(UPLOAD_DIR)) {
        fs.promises.unlink(file).catch(() => {});
      }
    }
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true });
});

/** Reorder products (drag & drop in the admin panel). */
app.post('/api/admin/products/reorder', requireAuth, requireFullAdmin, (req, res) => {
  const order = req.body && req.body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'Order must be a non-empty list of product ids.' });
  }
  const ids = order.map((v) => Number(v));
  if (ids.some((v) => !Number.isInteger(v))) {
    return res.status(400).json({ error: 'Order must contain only product ids.' });
  }
  const update = db.prepare('UPDATE products SET sort_order = ? WHERE id = ?');
  const run = db.transaction(() => {
    ids.forEach((id, index) => update.run(index + 1, id));
  });
  run();
  res.json(getAllProducts());
});

/* ------------------------------------------------------------------ */
/* Admin: image upload                                                 */
/* ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (okTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG and WebP images are allowed.'));
  },
});

app.post('/api/admin/upload', requireAuth, requireFullAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Image is too large. Maximum size is 5 MB.'
        : err.message || 'Upload failed.';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });

    const mime = req.file.mimetype;
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const outPath = path.join(UPLOAD_DIR, filename);

    try {
      if (sharp) {
        try {
          // Resize to max 1200px on the long side and compress.
          let pipeline = sharp(req.file.buffer).resize(1200, 1200, {
            fit: 'inside',
            withoutEnlargement: true,
          });
          if (ext === 'jpg') pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true });
          else if (ext === 'png') pipeline = pipeline.png({ compressionLevel: 8 });
          else pipeline = pipeline.webp({ quality: 82 });
          await pipeline.toFile(outPath);
        } catch (sharpErr) {
          // sharp could not read this file (rare/corrupt image): fall back
          // to storing the original validated file instead of failing.
          console.warn('[upload] sharp could not process image, saving original:', sharpErr.message);
          await fs.promises.writeFile(outPath, req.file.buffer);
        }
      } else {
        await fs.promises.writeFile(outPath, req.file.buffer);
      }
      return res.json({ url: `/uploads/${filename}` });
    } catch (e) {
      console.error('[upload] failed:', e);
      return res.status(500).json({ error: 'Could not save the image. Please try another file.' });
    }
  });
});

/** Delete one uploaded image file (used by the admin image manager). */
app.delete('/api/admin/uploads', requireAuth, requireFullAdmin, (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'Invalid image URL.' });
  }
  const file = path.join(UPLOAD_DIR, path.basename(url));
  if (!file.startsWith(UPLOAD_DIR)) {
    return res.status(400).json({ error: 'Invalid image URL.' });
  }
  fs.promises.unlink(file)
    .then(() => res.json({ ok: true }))
    .catch(() => res.status(404).json({ error: 'Image file not found.' }));
});

/* ------------------------------------------------------------------ */
/* Admin: settings                                                     */
/* ------------------------------------------------------------------ */
// Store themes (two-color combinations). 'lavender' is the default — the "Plum + Gold" logo-colors theme (key kept as 'lavender' so existing installs keep working).
const THEMES = ['lavender', 'sunset', 'rose', 'plum', 'sage'];

const SETTING_KEYS = [
  'store_name', 'theme', 'tagline', 'hero_headline', 'hero_subheadline',
  'announcement_text', 'announcement_enabled', 'about_text', 'contact_email',
  'currency', 'trust_badges', 'disclosure_text', 'disclosure_enabled',
  'social_facebook', 'social_tiktok', 'social_instagram', 'social_youtube',
  'legal_privacy', 'legal_terms', 'legal_shipping',
];

app.get('/api/admin/settings', requireAuth, requireFullAdmin, (req, res) => {
  const s = getAllSettings();
  const out = {};
  for (const key of SETTING_KEYS) {
    if (key === 'trust_badges') out[key] = getJsonSetting(key, []);
    else out[key] = s[key] ?? '';
  }
  res.json(out);
});

app.put('/api/admin/settings', requireAuth, requireFullAdmin, (req, res) => {
  const body = req.body || {};
  const errors = [];

  const str = (key, max) => {
    if (body[key] === undefined) return;
    if (typeof body[key] !== 'string' || body[key].length > max) {
      errors.push(`${key} must be text of ${max} characters or fewer.`);
    }
  };
  str('store_name', 80);
  str('tagline', 200);
  if (body.theme !== undefined && !THEMES.includes(body.theme)) {
    errors.push(`theme must be one of: ${THEMES.join(', ')}.`);
  }
  str('hero_headline', 160);
  str('hero_subheadline', 400);
  str('announcement_text', 160);
  str('about_text', 2000);
  str('contact_email', 120);
  str('currency', 4);
  str('disclosure_text', 400);
  str('legal_privacy', 10000);
  str('legal_terms', 10000);
  str('legal_shipping', 10000);
  for (const key of ['social_facebook', 'social_tiktok', 'social_instagram', 'social_youtube']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string' || body[key].length > 500) {
        errors.push(`${key} must be text of 500 characters or fewer.`);
      } else if (body[key].trim() !== '' && !isValidHttpUrl(body[key])) {
        errors.push(`${key} must be a full http(s) URL, or left empty.`);
      }
    }
  }
  if (body.contact_email !== undefined && body.contact_email.trim() !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact_email.trim())) {
      errors.push('Contact email does not look like a valid email address.');
    }
  }
  if (body.announcement_enabled !== undefined &&
      body.announcement_enabled !== '0' && body.announcement_enabled !== '1' &&
      body.announcement_enabled !== 0 && body.announcement_enabled !== 1 &&
      body.announcement_enabled !== true && body.announcement_enabled !== false) {
    errors.push('announcement_enabled must be on or off.');
  }
  if (body.disclosure_enabled !== undefined &&
      body.disclosure_enabled !== '0' && body.disclosure_enabled !== '1' &&
      body.disclosure_enabled !== 0 && body.disclosure_enabled !== 1 &&
      body.disclosure_enabled !== true && body.disclosure_enabled !== false) {
    errors.push('disclosure_enabled must be on or off.');
  }
  if (body.trust_badges !== undefined) {
    if (!Array.isArray(body.trust_badges) || body.trust_badges.length > 5 ||
        body.trust_badges.some((b) => typeof b !== 'string' || b.length > 60)) {
      errors.push('Trust badges must be a list of at most 5 short texts.');
    }
  }
  if (errors.length > 0) return res.status(400).json({ error: errors[0] });

  const save = db.transaction(() => {
    for (const key of SETTING_KEYS) {
      if (body[key] === undefined) continue;
      if (key === 'trust_badges') {
        setSetting(key, JSON.stringify(body.trust_badges));
      } else if (key === 'announcement_enabled' || key === 'disclosure_enabled') {
        const v = body[key];
        setSetting(key, (v === true || v === 1 || v === '1') ? '1' : '0');
      } else {
        setSetting(key, String(body[key]).trim());
      }
    }
  });
  save();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Public pages                                                        */
/* ------------------------------------------------------------------ */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: false }));
app.use(express.static(PUBLIC_DIR, { maxAge: NODE_ENV === 'production' ? '1h' : 0 }));

// Admin panel entry point: /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// Legal pages (content editable from the admin panel).
function legalPageHtml(pageTitle, settingKey) {
  const s = getAllSettings();
  const storeName = escapeHtml(s.store_name || 'Demi Somi Finds');
  const raw = s[settingKey] || '';
  // First line is the page heading; the rest is paragraphs.
  const lines = String(raw).split('\n');
  const heading = escapeHtml((lines[0] || pageTitle).trim());
  const body = lines.slice(1).join('\n');
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)} — ${storeName}</title>
<meta name="description" content="${escapeHtml(pageTitle)} for ${storeName}.">
<link rel="stylesheet" href="/css/style.css">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body>
<header class="site-header"><div class="container nav-wrap">
<a class="brand" href="/">${storeName}</a>
<nav class="main-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/#products">Products</a><a href="/#about">About</a><a href="/#contact">Contact</a></nav>
</div></header>
<main class="container legal-page">
<h1>${heading}</h1>
${paragraphs || '<p>Content coming soon.</p>'}
<p><a href="/" class="btn btn-secondary">← Back to the store</a></p>
</main>
<footer class="site-footer"><div class="container"><p>© ${new Date().getFullYear()} ${storeName}. All rights reserved.</p></div></footer>
</body>
</html>`;
}

app.get('/privacy', (req, res) => res.send(legalPageHtml('Privacy Policy', 'legal_privacy')));
app.get('/terms', (req, res) => res.send(legalPageHtml('Terms of Use', 'legal_terms')));
app.get('/shipping', (req, res) => res.send(legalPageHtml('Shipping & Returns', 'legal_shipping')));

/* ------------------------------------------------------------------ */
/* 404 + error handling                                                */
/* ------------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).send(
    '<!DOCTYPE html><html lang="en-US"><head><meta charset="UTF-8">' +
    '<title>Page not found — Demi Somi Finds</title>' +
    '<link rel="stylesheet" href="/css/style.css"></head><body>' +
    '<main class="container legal-page"><h1>Page not found</h1>' +
    '<p>Sorry, that page does not exist.</p>' +
    '<p><a class="btn btn-primary" href="/">Back to the store</a></p></main></body></html>'
  );
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  res.status(500).send('Something went wrong. Please try again.');
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */
seed(); // safe: only fills what is missing

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demi Somi Finds is running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
