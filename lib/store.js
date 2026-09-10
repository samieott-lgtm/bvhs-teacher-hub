const pool = require('./db');

// ---- Generic list (array) resources: announcements, events, links, etc. ----
// Each item is stored as one row: { id, resource, data (jsonb) }.
// This keeps lib/resources.js (the field definitions) working unchanged.

async function getAll(resource) {
  const { rows } = await pool.query(
    'SELECT id, data FROM content_items WHERE resource = $1 ORDER BY id ASC',
    [resource]
  );
  return rows.map((r) => Object.assign({ id: r.id }, r.data));
}

async function getById(resource, id) {
  const { rows } = await pool.query(
    'SELECT id, data FROM content_items WHERE resource = $1 AND id = $2',
    [resource, id]
  );
  if (!rows[0]) return null;
  return Object.assign({ id: rows[0].id }, rows[0].data);
}

async function addItem(resource, item) {
  const { rows } = await pool.query(
    'INSERT INTO content_items (resource, data) VALUES ($1, $2) RETURNING id',
    [resource, item]
  );
  return Object.assign({ id: rows[0].id }, item);
}

async function updateItem(resource, id, updates) {
  const current = await getById(resource, id);
  if (!current) return null;
  const merged = Object.assign({}, current, updates);
  delete merged.id;
  await pool.query('UPDATE content_items SET data = $1 WHERE resource = $2 AND id = $3', [
    merged,
    resource,
    id,
  ]);
  return Object.assign({ id: Number(id) }, merged);
}

async function deleteItem(resource, id) {
  await pool.query('DELETE FROM content_items WHERE resource = $1 AND id = $2', [resource, id]);
}

// ---- Single free-text pages (Mustang Time, HRS, etc.) ----

async function getPage(key) {
  const { rows } = await pool.query('SELECT title, body FROM pages WHERE key = $1', [key]);
  return rows[0] || { title: '', body: '' };
}

async function setPage(key, data) {
  await pool.query(
    `INSERT INTO pages (key, title, body) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET title = $2, body = $3`,
    [key, data.title, data.body]
  );
}

// ---- Site settings ----

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const out = {};
  rows.forEach((r) => {
    out[r.key] = r.value;
  });
  return out;
}

async function setSettings(updates) {
  for (const key of Object.keys(updates)) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, updates[key]]
    );
  }
}

// ---- Staff / admin user accounts ----

async function getAllUsers() {
  const { rows } = await pool.query(
    'SELECT id, username, name, role, created_at FROM users ORDER BY name ASC, id ASC'
  );
  return rows;
}

async function getUserByUsername(username) {
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT id, username, name, role FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function countAdmins() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
  return rows[0].count;
}

async function addUser({ username, name, passwordHash, role }) {
  const { rows } = await pool.query(
    'INSERT INTO users (username, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [username, name, passwordHash, role]
  );
  return rows[0].id;
}

async function updateUser(id, { name, role }) {
  await pool.query('UPDATE users SET name = $1, role = $2 WHERE id = $3', [name, role, id]);
}

async function updateUserPassword(id, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = {
  getAll,
  getById,
  addItem,
  updateItem,
  deleteItem,
  getPage,
  setPage,
  getSettings,
  setSettings,
  getAllUsers,
  getUserByUsername,
  getUserById,
  countAdmins,
  addUser,
  updateUser,
  updateUserPassword,
  deleteUser,
};
