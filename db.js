/**
 * db.js — SQLite database layer for Demi Somi Finds.
 *
 * Uses better-sqlite3 (synchronous, single-file database).
 * The database file lives at ./data/store.db and uploaded product images
 * live in ./data/uploads so that one persistent disk on the host covers
 * BOTH the database and the uploads.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'store.db');

// Make sure the folders exist before opening the database.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
// WAL mode: safer for concurrent reads/writes (admin + visitors at once).
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price       REAL NOT NULL DEFAULT 0,
    category    TEXT NOT NULL DEFAULT 'Beauty',
    buy_link    TEXT NOT NULL DEFAULT '',
    images      TEXT NOT NULL DEFAULT '[]',
    visible     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    must_change     INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
`);

/* ------------------------------------------------------------------ */
/* Settings helpers (key/value store; complex values are JSON strings) */
/* ------------------------------------------------------------------ */
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  setSettingStmt.run(key, String(value));
}

/** Returns all settings as a plain object { key: value }. */
function getAllSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    out[row.key] = row.value;
  }
  return out;
}

/** Parse a settings value that holds JSON (returns fallback on bad JSON). */
function getJsonSetting(key, fallback) {
  const raw = getSetting(key, null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* Product helpers                                                     */
/* ------------------------------------------------------------------ */

/** Convert a DB row into a safe public product object. */
function toProduct(row) {
  if (!row) return null;
  let images = [];
  try {
    const parsed = JSON.parse(row.images || '[]');
    if (Array.isArray(parsed)) images = parsed.filter((u) => typeof u === 'string');
  } catch {
    images = [];
  }
  return {
    id: row.id,
    name: row.name,
    title: row.title || '',
    description: row.description || '',
    price: Number(row.price) || 0,
    category: row.category || 'Beauty',
    buy_link: row.buy_link || '',
    images,
    visible: row.visible === 1,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const getVisibleProductsStmt = db.prepare(
  'SELECT * FROM products WHERE visible = 1 ORDER BY sort_order ASC, id ASC'
);
const getAllProductsStmt = db.prepare(
  'SELECT * FROM products ORDER BY sort_order ASC, id ASC'
);
const getProductStmt = db.prepare('SELECT * FROM products WHERE id = ?');

function getVisibleProducts() {
  return getVisibleProductsStmt.all().map(toProduct);
}

function getAllProducts() {
  return getAllProductsStmt.all().map(toProduct);
}

function getProduct(id) {
  return toProduct(getProductStmt.get(id));
}

module.exports = {
  db,
  DATA_DIR,
  UPLOAD_DIR,
  DB_PATH,
  getSetting,
  setSetting,
  getAllSettings,
  getJsonSetting,
  getVisibleProducts,
  getAllProducts,
  getProduct,
  toProduct,
};
