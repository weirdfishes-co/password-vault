# Vault — Claude Code Guide

## Running the app

```bash
npm run dev   # starts on http://localhost:3000 with --watch (auto-reload)
npm start     # production start (no watch)
```

No build step. No test suite. Restart is automatic in dev mode when files change.

## Tech stack

- **Runtime:** Node.js >= 22.5 (uses built-in `node:sqlite` — no external DB driver)
- **Framework:** Express 4 with EJS templates (no layout engine — every view is a standalone HTML file)
- **Crypto:** `crypto.js` — scrypt key derivation + AES-256-GCM encrypt/decrypt (Node built-ins only)
- **Database:** `db.js` — raw SQLite via `node:sqlite`, no ORM
- **Security middleware:** Helmet (CSP, HSTS), express-session, express-rate-limit, express-validator, manual CSRF tokens

## Architecture decisions worth knowing

- **No npm crypto dependencies** — all encryption uses Node.js built-ins (`node:crypto`, `node:sqlite`)
- **PIN never stored** — only a verification blob encrypted with the derived key; correct PIN = successful decrypt
- **All views are standalone HTML** — EJS layout.ejs was removed; each view has its own `<!DOCTYPE html>`
- **CSRF** — manual per-session token, validated on every POST/PUT/DELETE/PATCH in `validateCsrf` middleware
- **Theme switcher** — `public/theme.js` injects a sun/moon button into `.vault-header-actions` (or fixed corner on auth pages); preference stored in `vault-theme` cookie (SameSite=Strict, ~400-day max-age); tiny inline `<head>` script applies theme before CSS renders to prevent flash

## Key files

| File | Purpose |
|---|---|
| `app.js` | All routes, middleware, session management |
| `crypto.js` | `generateSalt`, `deriveKey`, `encrypt`, `decrypt` |
| `db.js` | SQLite schema + query helpers |
| `public/theme.js` | Client-side theme toggle + cookie logic |
| `views/vault.ejs` | Main vault page (search, copy, edit, delete, export) |
| `views/entry-form.ejs` | Add / edit entry (includes password generator) |

## Security model

- All entry data is encrypted before being written to SQLite; the vault key lives only in the server-side session
- Session timeout: 30 minutes of inactivity → redirect to `/unlock`
- Lockout: 5 wrong PINs → 5-minute lockout stored in DB
- Rate limit: 20 unlock attempts per 15 min per IP
- EJS always uses `<%= %>` (HTML-escaped) — never `<%- %>` for user data
- URLs stored in entries are not currently restricted to http/https — known gap, validate protocol if adding URL rendering elsewhere

## Environment variables

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | Required in production; random 64-byte hex string |
| `DB_PATH` | Path to SQLite file; defaults to `./vault.db` |
| `NODE_ENV` | Set to `production` on Railway / Hostim |
| `PORT` | Set automatically by Railway; defaults to 3000 |
