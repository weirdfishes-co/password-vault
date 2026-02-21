# Password Vault

A secure, self-hosted password manager. All credentials are encrypted at rest using AES-256-GCM and a key derived from your 6-digit PIN with Argon2id.

## File structure

```
├── app.js              — Express app: routes, middleware, session management
├── crypto.js           — Argon2id key derivation + AES-256-GCM encrypt/decrypt
├── db.js               — SQLite database setup and query helpers (node:sqlite)
├── views/
│   ├── setup.ejs       — First-time PIN creation
│   ├── unlock.ejs      — PIN unlock form
│   ├── vault.ejs       — Entry list with search, copy, edit, delete
│   └── entry-form.ejs  — Add / edit entry form with password generator
├── public/
│   └── style.css       — Dark theme, responsive layout
├── package.json
├── Procfile            — Railway process definition
├── railway.toml        — Railway build and deploy config
└── .env.example        — Environment variable reference
```

## Security features

| Feature | Detail |
|---|---|
| Key derivation | Argon2id — 64 MB memory, 3 iterations, 4 threads |
| Encryption | AES-256-GCM with a random 12-byte nonce per operation |
| PIN storage | Never stored — only a verification blob encrypted with the derived key |
| CSRF protection | Per-session token validated on every state-changing request |
| Rate limiting | 20 unlock attempts per 15 minutes per IP |
| Vault lockout | Locked for 5 minutes after 5 consecutive wrong PINs |
| Session timeout | Auto-lock after 30 minutes of inactivity |
| Security headers | Helmet.js — CSP, HSTS, X-Frame-Options, Referrer-Policy |
| Cookies | HttpOnly, Secure, SameSite=Strict |

## Local development

```bash
cp .env.example .env
# Edit .env — set SESSION_SECRET to a random hex string:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

npm install
node app.js
# Open http://localhost:3000
```

Requires **Node.js >= 22.5** (uses the built-in `node:sqlite` module).

## Railway deployment

### 1. Push to GitHub

Commit all files (excluding `node_modules/`, `.env`, `*.db` — already in `.gitignore`).

### 2. Create a Railway project

- Connect your GitHub repository in the Railway dashboard.
- Railway auto-detects Node.js and installs dependencies.

### 3. Add a persistent volume

The SQLite database must survive redeploys:

1. In Railway → your service → **Volumes** → **Add Volume**
2. Mount path: `/data`

### 4. Set environment variables

In Railway → your service → **Variables**:

| Variable | Value |
|---|---|
| `SESSION_SECRET` | Random 64-byte hex — run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `DB_PATH` | `/data/vault.db` |
| `NODE_ENV` | `production` |

`PORT` is set automatically by Railway — do not override it.

### 5. Deploy

Railway deploys automatically on every push to your connected branch. The start command is set in `railway.toml`:

```
node --disable-warning=ExperimentalWarning app.js
```

### First run

On first visit, you will be directed to `/setup` to create your 6-digit PIN. After that, the PIN cannot be recovered — if lost, the encrypted database must be deleted and a new vault started.
