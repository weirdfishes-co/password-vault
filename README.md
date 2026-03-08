# Password Vault

A secure, self-hosted, open source password manager. All credentials are encrypted at rest using AES-256-GCM and a key derived from your 6-digit PIN with scrypt. Deploy instructions for Railway.com (global) or Hostim.dev (europe).

## File structure

```
├── app.js              — Express app: routes, middleware, session management
├── crypto.js           — scrypt key derivation + AES-256-GCM encrypt/decrypt
├── db.js               — SQLite database setup and query helpers (node:sqlite)
├── views/
│   ├── setup.ejs       — First-time PIN creation
│   ├── unlock.ejs      — PIN unlock form
│   ├── vault.ejs       — Entry list with search, copy, edit, delete, download, import
│   ├── import.ejs      — CSV import form
│   └── entry-form.ejs  — Add / edit entry form with password generator
├── public/
│   └── style.css       — Dark theme, responsive layout
├── package.json
├── Dockerfile          — Docker image for container deployments
├── .dockerignore       — Files excluded from the Docker build
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

## Railway.com deployment

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
| `SESSION_SECRET` | Yes | Random hex string — minimum 32 characters, recommended 128 (64 random bytes). Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
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

## Hostim.dev deployment

### 1. Push to GitHub

Commit all files (excluding `node_modules/`, `.env`, `*.db` — already in `.gitignore`). The `Dockerfile` and `.dockerignore` must be present in the root of the repository.

### 2. Create a hostim.dev project

- Connect your GitHub repository in the hostim.dev dashboard.
- hostim.dev uses Kaniko to build the Docker image from the `Dockerfile` automatically.

### 3. Configure the service

In the service settings, set **HTTP Port** to `80`.

### 4. Set environment variables

| Variable | Required | Value |
|---|---|---|
| `SESSION_SECRET` | Yes | Random hex string — minimum 32 characters, recommended 128 (64 random bytes). Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `80` |
| `DB_PATH` | Yes | `/data/vault.db` |

### 5. Persistent storage

Mount a persistent volume at `/data` in the hostim.dev service settings so the database survives redeploys. The `DB_PATH` variable (set above) tells the app to store the database on that volume.

### 6. Deploy

hostim.dev deploys automatically on every push to your connected branch.

### First run

On first visit, you will be directed to `/setup` to create your 6-digit PIN. After that, the PIN cannot be recovered — if lost, the encrypted database must be deleted and a new vault started.

## CSV export

The **Download** button on the vault page streams a CSV file directly to your browser. The CSV contains: Title, Username, Password, URL, Notes. No email or external service is involved — the file is generated server-side and downloaded over the existing HTTPS session. Delete the file after use.

## CSV import

The **Import** button on the vault page lets you upload a CSV file to bulk-add entries. The expected format is the same as the export:

```
Title,Username,Password,URL,Notes
```

- The header row is detected automatically and skipped.
- Rows without a title are skipped.
- Fields are truncated to the same limits as manual entry (title: 200, username: 500, password: 2000, URL: 2000, notes: 5000 characters).
- All imported data is encrypted with your vault key before being stored — the CSV itself is never saved to disk on the server.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
