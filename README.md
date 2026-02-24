# Password Vault

A secure, self-hosted password manager. All credentials are encrypted at rest using AES-256-GCM and a key derived from your 6-digit PIN with scrypt.

## File structure

```
├── app.js              — Express app: routes, middleware, session management
├── crypto.js           — scrypt key derivation + AES-256-GCM encrypt/decrypt
├── db.js               — SQLite database setup and query helpers (node:sqlite)
├── views/
│   ├── setup.ejs       — First-time PIN creation
│   ├── unlock.ejs      — PIN unlock form
│   ├── vault.ejs       — Entry list with search, copy, edit, delete, download
│   └── entry-form.ejs  — Add / edit entry form with password generator
├── public/
│   └── style.css       — Dark theme, responsive layout
├── package.json
├── Procfile            — Process definition
└── railway.toml        — Railway build and deploy config
```

## Security features

| Feature | Detail |
|---|---|
| Key derivation | scrypt — 32 MB memory (N=32768, r=8, p=1) |
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
npm run dev
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

| Variable | Required | Value |
|---|---|---|
| `SESSION_SECRET` | Yes | Random hex — `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `DB_PATH` | Yes | `/data/vault.db` |
| `NODE_ENV` | Yes | `production` |

`PORT` is set automatically by Railway — do not override it.

### 5. Deploy

Railway deploys automatically on every push to your connected branch. The start command is set in `railway.toml` and `package.json`:

```
npm start
```

### First run

On first visit, you will be directed to `/setup` to create your 6-digit PIN. After that, the PIN cannot be recovered — if lost, the encrypted database must be deleted and a new vault started.

## CSV export

The **Download** button on the vault page streams a CSV file directly to your browser. The CSV contains: Title, Username, Password, URL, Notes. No email or external service is involved — the file is generated server-side and downloaded over the existing HTTPS session. Delete the file after use.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
