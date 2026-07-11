/*
 * PersonaX Autofill Vault
 * -----------------------
 * Stores account info per PersonaX profile (keyed by profile ID like AAA0001)
 * and serves it to the browser extension so Alt+X can autofill signup/signin forms.
 *
 * Two auth layers:
 *   - Human admin logs in to the web page with ADMIN_USER / ADMIN_PASS. On success the
 *     server hands the page the vault key, which the page then uses for every /api call.
 *   - The browser extension talks to /api directly with the same vault key in the
 *     "x-vault-key" header.
 */
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 4600;
// Change these in production (systemd Environment=...).
const VAULT_KEY  = process.env.VAULT_KEY  || 'personax-vault-demo-key';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

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

const norm = (id) => String(id || '').trim().toUpperCase();

const upsert = db.prepare(`
  INSERT INTO profiles (profile_id, first_name, last_name, email, password, recovery_email, phone, dob_day, dob_month, dob_year, country, notes, updated_at)
  VALUES (@profile_id, @first_name, @last_name, @email, @password, @recovery_email, @phone, @dob_day, @dob_month, @dob_year, @country, @notes, @updated_at)
  ON CONFLICT(profile_id) DO UPDATE SET
    first_name=@first_name, last_name=@last_name, email=@email, password=@password,
    recovery_email=@recovery_email, phone=@phone, dob_day=@dob_day, dob_month=@dob_month,
    dob_year=@dob_year, country=@country, notes=@notes, updated_at=@updated_at
`);

// --- login: exchange admin user/pass for the vault key (NOT under /api, so no key needed) ---
app.post('/login', (req, res) => {
  const user = String(req.body.user || '');
  const pass = String(req.body.pass || '');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return res.json({ ok: true, vaultKey: VAULT_KEY });
  return res.status(401).json({ error: 'wrong username or password' });
});

// --- auth guard for every /api route ---
app.use('/api', (req, res, next) => {
  const key = req.get('x-vault-key');
  if (!key || key !== VAULT_KEY) return res.status(401).json({ error: 'bad or missing vault key' });
  next();
});

// list all profiles (for the admin table)
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
  upsert.run({ profile_id: id, ...val, updated_at: Number(req.body._now) || 0 });
  res.json({ ok: true, profile_id: id });
});

// bulk import: array of profile objects (or a CSV parsed client-side into rows)
app.post('/api/import', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  const now = Number(req.body._now) || 0;
  let n = 0;
  const tx = db.transaction((list) => {
    for (const r of list) {
      const id = norm(r.profile_id);
      if (!id) continue;
      const val = {};
      FIELDS.forEach(f => { val[f] = r[f] !== undefined ? String(r[f]) : ''; });
      upsert.run({ profile_id: id, ...val, updated_at: now });
      n++;
    }
  });
  tx(rows);
  res.json({ ok: true, imported: n });
});

/* ---------- bulk create: generate N fresh profiles from a base ID ----------
   e.g. base_id=AAA0001, count=50 -> creates AAA0002 .. AAA0051 with randomized
   name / last name / birth date / password / Outlook-style email. Recovery email
   and phone are intentionally left blank (client fills the signup form manually). */

const FIRST_NAMES = ['James','Michael','John','David','Daniel','Joseph','Mark','Paul','Kevin','Brian',
  'Maria','Anna','Grace','Rose','Joy','Angel','Christine','Kim','Nicole','Kate',
  'Carlo','Miguel','Juan','Jose','Andres','Rafael','Diego','Luis','Marco','Nathan',
  'Sofia','Bea','Ella','Mia','Lea','Hannah','Ivy','Faith','Jenny','Karla'];
const LAST_NAMES = ['Dela Cruz','Santos','Reyes','Garcia','Ramos','Mendoza','Torres','Flores','Villanueva','Castillo',
  'Aquino','Bautista','Navarro','Domingo','Salazar','Cruz','Gonzales','Rivera','Aguilar','Fernandez',
  'Lopez','Perez','Morales','Ocampo','Pascual','Valdez','Diaz','Rosales','Tolentino','Alvarez'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function genPassword() {
  // Microsoft rule: 8+ chars, mix of upper/lower/number/symbol. Build ~12 chars that always qualify.
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%&*?';
  const base = pick(FIRST_NAMES).replace(/[^A-Za-z]/g, '');
  const cap = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  let pw = cap + pick(D) + pick(D) + pick(D) + pick(S) + pick(U) + pick(L);
  // shuffle the tail a little so it isn't a predictable shape
  return pw + pick(D) + pick(S);
}

function genEmail(first, last) {
  const a = first.replace(/[^A-Za-z]/g, '').toLowerCase();
  const b = last.replace(/[^A-Za-z]/g, '').toLowerCase();
  const sep = pick(['', '.', '_']);
  return `${a}${sep}${b}${randInt(10, 9999)}@outlook.com`;
}

function parseBaseId(base) {
  const m = String(base || '').trim().toUpperCase().match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length };
}

app.post('/api/bulk-create', (req, res) => {
  const parsed = parseBaseId(req.body.base_id);
  if (!parsed) return res.status(400).json({ error: 'base ID must end in a number, e.g. AAA0001' });
  let count = parseInt(req.body.count, 10);
  if (!Number.isFinite(count) || count < 1) return res.status(400).json({ error: 'count must be 1 or more' });
  if (count > 200) count = 200; // safety cap per call
  const country = String(req.body.country || 'Philippines');
  const now = Number(req.body._now) || 0;
  const fmt = (n) => parsed.prefix + String(n).padStart(parsed.width, '0');

  const created = [], skipped = [];
  const exists = db.prepare('SELECT 1 FROM profiles WHERE profile_id = ?');
  const tx = db.transaction(() => {
    // Produce `count` NEW profiles, walking forward past any IDs that already exist.
    let n = parsed.num;
    const limit = parsed.num + count + 5000; // safety bound
    while (created.length < count && n < limit) {
      n++;
      const id = fmt(n);
      if (exists.get(id)) { skipped.push(id); continue; }
      const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
      const rec = {
        profile_id: id,
        first_name: first,
        last_name: last,
        email: genEmail(first, last),
        password: genPassword(),
        recovery_email: '',        // left blank on purpose
        phone: '',                 // left blank on purpose
        dob_day: String(randInt(1, 28)),
        dob_month: pick(MONTHS),
        dob_year: String(randInt(1985, 2004)),
        country,
        notes: '',
        updated_at: now
      };
      upsert.run(rec);
      created.push({ profile_id: id, first_name: first, last_name: last, email: rec.email, password: rec.password });
    }
  });
  tx();
  res.json({ ok: true, created, skipped, range: created.length ? [created[0].profile_id, created[created.length - 1].profile_id] : null });
});

app.delete('/api/profile/:id', (req, res) => {
  db.prepare('DELETE FROM profiles WHERE profile_id = ?').run(norm(req.params.id));
  res.json({ ok: true });
});

// admin UI
app.use('/', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('Autofill Vault listening on http://127.0.0.1:' + PORT));
