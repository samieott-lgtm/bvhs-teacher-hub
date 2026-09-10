const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data-seed');

const LIST_RESOURCES = [
  'announcements', 'weekly', 'events', 'links', 'todos', 'deadlines', 'documents', 'staff', 'pd',
];

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_items (
      id SERIAL PRIMARY KEY,
      resource TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_content_items_resource ON content_items(resource);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pages (
      key TEXT PRIMARY KEY,
      title TEXT,
      body TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // connect-pg-simple creates its own "session" table automatically.
}

// If this school already ran Phase 1 (the JSON-file version) and has a Volume
// with real edited content in it, prefer that over the blank example content
// that ships with the app - so nothing gets lost on the upgrade.
function readSeedJSON(name, fallback) {
  for (const dir of [DATA_DIR, SEED_DIR]) {
    const p = path.join(dir, `${name}.json`);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (err) {
        // fall through to next location / fallback
      }
    }
  }
  return fallback;
}

async function seedListResourcesIfEmpty() {
  for (const resource of LIST_RESOURCES) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM content_items WHERE resource = $1', [resource]);
    if (rows[0].count === 0) {
      const items = readSeedJSON(resource, []);
      for (const item of items) {
        const clean = Object.assign({}, item);
        delete clean.id;
        await pool.query('INSERT INTO content_items (resource, data) VALUES ($1, $2)', [resource, clean]);
      }
    }
  }
}

async function seedPagesIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM pages');
  if (rows[0].count === 0) {
    const pages = readSeedJSON('pages', {});
    for (const key of Object.keys(pages)) {
      await pool.query(
        'INSERT INTO pages (key, title, body) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [key, pages[key].title || '', pages[key].body || '']
      );
    }
  }
}

async function seedSettingsIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM settings');
  if (rows[0].count === 0) {
    const settings = readSeedJSON('settings', {});
    for (const key of Object.keys(settings)) {
      await pool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [key, String(settings[key])]
      );
    }
  }
}

async function seedInitialAdminIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  if (rows[0].count === 0) {
    const username = process.env.ADMIN_USERNAME || 'principal';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, name, password_hash, role) VALUES ($1, $2, $3, $4)',
      [username, 'Principal', hash, 'admin']
    );
    console.log(`Created the first admin account ("${username}") from ADMIN_USERNAME / ADMIN_PASSWORD.`);
  }
}

async function runMigrations() {
  await createTables();
  await seedListResourcesIfEmpty();
  await seedPagesIfEmpty();
  await seedSettingsIfEmpty();
  await seedInitialAdminIfEmpty();
}

module.exports = { runMigrations };
