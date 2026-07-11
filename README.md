# PersonaX Autofill Vault

Store each PersonaX profile's account info in one place, then press **Alt+X** on any
signup / sign-in page to autofill the whole form for that profile.

Two parts:

## 1. Vault server (`/server`)
A small Node + SQLite service with a web admin page (protected by a username/password login).
- Add/edit each profile keyed by its PersonaX profile ID (e.g. `AAA0001`).
- Fields: first name, last name, email/username, password, recovery email, phone,
  birth day/month/year, country, notes.
- **Bulk create**: give a starting ID (e.g. `AAA0001`) and a count, and it generates the next
  IDs in sequence (`AAA0002 … AAA00xx`), each with a random first name, last name, birth date,
  password and an Outlook-style email. Recovery email and phone are left blank on purpose.
  IDs that already exist are skipped (never overwritten).
- Bulk import by pasting CSV.
- The human admin logs in with `ADMIN_USER` / `ADMIN_PASS`; the extension talks to the API
  directly with the secret **vault key** (`x-vault-key` header).

Run:
```bash
cd server
npm install
VAULT_KEY=your-secret-key ADMIN_USER=admin ADMIN_PASS=your-password PORT=4600 npm start
# admin page: http://127.0.0.1:4600
```

## 2. Browser extension (`/extension`)
Loaded inside PersonaX (Manifest V3, Chromium).
- Popup: set the vault URL, the vault key, and **this profile's ID** (once per profile —
  it's remembered because each PersonaX profile is a separate browser).
- On a signup/sign-in page press **Alt+X** → it pulls that profile's info from the vault
  and fills every matching field (name, email, password + confirm, DOB, country dropdown,
  phone, recovery email). A small toast confirms how many fields were filled.

Load it: PersonaX/Chrome → Extensions → Developer mode → Load unpacked → pick the
`extension` folder.

### How the extension knows which profile it's in
By default you set the profile ID once in the popup (always works). If PersonaX exposes
the active profile ID to the page (e.g. a global variable or a URL parameter), the
extension auto-detects it — see `detectProfileId()` in `content.js`.

## Security notes
- The vault key is stored only in the extension and sent as a header; it never appears in page JS.
- Put the server behind HTTPS and a strong `VAULT_KEY` in production.
- `vault.db` holds account data — keep it private, back it up, never commit it.
