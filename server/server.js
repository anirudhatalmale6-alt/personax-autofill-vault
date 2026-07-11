/*
 * PersonaX Autofill Vault
 * -----------------------
 * Stores account info per PersonaX profile (keyed by profile ID like AAA0001)
 * and serves it to the browser extension so Alt+X can autofill signup/signin forms.
 *
 * Security: every /api call requires the shared secret in the "x-vault-key" header.
 * The admin page asks for the key once and keeps it in the browser session only.
 */
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 4600;
// Change this in production (systemd Environment=VAULT_KEY=...). Extension + admin use the same value.
const VAULT_KEY = process.env.VAULT_KEY || 'personax-vault-demo-key';

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'vault.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    profile_id     TEXT PRIMARY KEY,
    first_name     TEXT DEFAULT '',
    last_name      TEXT DEFAULT '',
    email          TEXT DEFAULT '',
    password       TEXT DEFAULT '',
    recovery_email TEXT DEFAULT '',
    phone          TEXT DEFAULT '',
    dob_day        TEXT DEFAULT '',
    dob_month      TEXT DEFAULT '',
    dob_year       TEXT DEFAULT '',
    country        TEXT DEFAULT '',
    notes          TEXT DEFAULT '',
    updated_at     INTEGER NOT NULL DEFAULT 0
  );
`);

const FIELDS = ['first_name','last_name','email','password','recovery_email','phone','dob_day','dob_month','dob_year','country','notes'];

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- auth guard for every /api route ---
app.use('/api', (req, res, next) => {
  const key = req.get('x-vault-key');
  if (!key || key !== VAULT_KEY) return res.status(401).json({ error: 'bad or missing vault key' });
  next();
});

const norm = (id) => String(id || '').trim().toUpperCase();

// list all profiles (id + email only, for the admin table)
app.get('/api/profiles', (req, res) => {
  const rows = db.prepare('SELECT profile_id, first_name, last_name, email, updated_at FROM profiles ORDER BY profile_id').all();
  res.json({ profiles: rows });
});

// full record for one profile — this is what the extension calls on Alt+X
app.get('/api/profile/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM profiles WHERE profile_id = ?').get(norm(req.params.id));
  if (!row) return res.status(404).json({ error: 'no info stored for profile ' + norm(req.params.id) });
  res.json({ profile: row });
});

// create or update a profile
app.post('/api/profile', (req, res) => {
  const id = norm(req.body.profile_id);
  if (!id) return res.status(400).json({ error: 'profile_id required' });
  const cur = db.prepare('SELECT * FROM profiles WHERE profile_id = ?').get(id) || {};
  const val = {};
  FIELDS.forEach(f => { val[f] = req.body[f] !== undefined ? String(req.body[f]) : (cur[f] || ''); });
  db.prepare(`
    INSERT INTO profiles (profile_id, first_name, last_name, email, password, recovery_email, phone, dob_day, dob_month, dob_year, country, notes, updated_at)
    VALUES (@profile_id, @first_name, @last_name, @email, @password, @recovery_email, @phone, @dob_day, @dob_month, @dob_year, @country, @notes, @updated_at)
    ON CONFLICT(profile_id) DO UPDATE SET
      first_name=@first_name, last_name=@last_name, email=@email, password=@password,
      recovery_email=@recovery_email, phone=@phone, dob_day=@dob_day, dob_month=@dob_month,
      dob_year=@dob_year, country=@country, notes=@notes, updated_at=@updated_at
  `).run({ profile_id: id, ...val, updated_at: Number(req.body._now) || 0 });
  res.json({ ok: true, profile_id: id });
});

// bulk import: array of profile objects (or a CSV parsed client-side into rows)
app.post('/api/import', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const now = Number(req.body._now) || 0;
  const stmt = db.prepare(`
    INSERT INTO profiles (profile_id, first_name, last_name, email, password, recovery_email, phone, dob_day, dob_month, dob_year, country, notes, updated_at)
    VALUES (@profile_id, @first_name, @last_name, @email, @password, @recovery_email, @phone, @dob_day, @dob_month, @dob_year, @country, @notes, @updated_at)
    ON CONFLICT(profile_id) DO UPDATE SET
      first_name=@first_name, last_name=@last_name, email=@email, password=@password,
      recovery_email=@recovery_email, phone=@phone, dob_day=@dob_day, dob_month=@dob_month,
      dob_year=@dob_year, country=@country, notes=@notes, updated_at=@updated_at
  `);
  let n = 0;
  const tx = db.transaction((list) => {
    for (const r of list) {
      const id = norm(r.profile_id);
      if (!id) continue;
      const val = {};
      FIELDS.forEach(f => { val[f] = r[f] !== undefined ? String(r[f]) : ''; });
      stmt.run({ profile_id: id, ...val, updated_at: now });
      n++;
    }
  });
  tx(rows);
  res.json({ ok: true, imported: n });
});

app.delete('/api/profile/:id', (req, res) => {
  db.prepare('DELETE FROM profiles WHERE profile_id = ?').run(norm(req.params.id));
  res.json({ ok: true });
});

// admin UI
app.use('/', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('Autofill Vault listening on http://127.0.0.1:' + PORT));
