'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const path = require('path');

const { generateSalt, deriveKey, encrypt, decrypt } = require('./crypto');
const db = require('./db');

// ── Constants ────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 5 * 60; // 5 minutes
const VERIFICATION_TOKEN = 'VAULT_OK_V1';

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();

// Trust Railway's proxy (correct IP for rate limiting + secure cookies)
if (IS_PROD) app.set('trust proxy', 1);

// Redirect HTTP → HTTPS in production
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && IS_PROD) {
  console.error('FATAL: SESSION_SECRET environment variable is not set.');
  process.exit(1);
}

app.use(
  session({
    secret: SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    name: 'vault.sid',
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: SESSION_TIMEOUT_MS,
    },
  })
);

// ── CSRF protection (manual, per-session token) ───────────────────────────────

app.use((req, res, next) => {
  // Generate a CSRF token once per session
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

function validateCsrf(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = req.body._csrf || req.headers['x-csrf-token'];
    if (!token || !req.session.csrfToken || token !== req.session.csrfToken) {
      return res.status(403).render('error', {
        message: 'Invalid or expired form token. Please go back and try again.',
      });
    }
  }
  next();
}

app.use(validateCsrf);

// ── Session inactivity timeout ───────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.session.vaultKeyHex) {
    const now = Date.now();
    const lastActive = req.session.lastActive || 0;
    if (now - lastActive > SESSION_TIMEOUT_MS) {
      req.session.destroy(() => {});
      return res.redirect('/unlock');
    }
    req.session.lastActive = now;
  }
  next();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVaultKey(req) {
  if (!req.session.vaultKeyHex) return null;
  return Buffer.from(req.session.vaultKeyHex, 'hex');
}

function requireAuth(req, res, next) {
  if (!getVaultKey(req)) return res.redirect('/unlock');
  next();
}

function isSetup() {
  return db.getConfig() !== undefined;
}

// ── Rate limiters ─────────────────────────────────────────────────────────────

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many unlock attempts from this IP. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many export requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (!isSetup()) return res.redirect('/setup');
  if (getVaultKey(req)) return res.redirect('/vault');
  return res.redirect('/unlock');
});

// ── Setup ─────────────────────────────────────────────────────────────────────

app.get('/setup', (req, res) => {
  if (isSetup()) return res.redirect('/unlock');
  res.render('setup', { error: null });
});

app.post(
  '/setup',
  [
    body('pin').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be exactly 6 digits.'),
    body('pin_confirm').custom((value, { req: r }) => {
      if (value !== r.body.pin) throw new Error('PINs do not match.');
      return true;
    }),
  ],
  async (req, res) => {
    if (isSetup()) return res.redirect('/unlock');
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.render('setup', { error: errors.array()[0].msg });

    try {
      const salt = generateSalt();
      const key = await deriveKey(req.body.pin, salt);
      db.insertConfig(salt, encrypt(key, VERIFICATION_TOKEN));
      return res.redirect('/unlock');
    } catch (err) {
      console.error('Setup error:', err);
      return res.render('setup', { error: 'Setup failed. Please try again.' });
    }
  }
);

// ── Unlock ────────────────────────────────────────────────────────────────────

app.get('/unlock', (req, res) => {
  if (!isSetup()) return res.redirect('/setup');
  if (getVaultKey(req)) return res.redirect('/vault');
  res.render('unlock', { error: null });
});

app.post(
  '/unlock',
  unlockLimiter,
  [body('pin').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('PIN must be exactly 6 digits.')],
  async (req, res) => {
    if (!isSetup()) return res.redirect('/setup');
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.render('unlock', { error: errors.array()[0].msg });

    const config = db.getConfig();
    const now = Math.floor(Date.now() / 1000);

    // Check DB-level lockout
    if (config.locked_until && now < config.locked_until) {
      const remaining = config.locked_until - now;
      const mins = Math.ceil(remaining / 60);
      return res.render('unlock', {
        error: `Vault is locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
      });
    }
    // Clear expired lockout
    if (config.locked_until && now >= config.locked_until) {
      db.resetAttempts();
    }

    try {
      const key = await deriveKey(req.body.pin, config.salt);
      const result = decrypt(key, config.verification);
      if (result !== VERIFICATION_TOKEN) throw new Error('Wrong PIN');

      db.resetAttempts();
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.render('unlock', { error: 'Session error. Please try again.' });
        }
        req.session.vaultKeyHex = key.toString('hex');
        req.session.lastActive = Date.now();
        // Re-generate CSRF token for the new session
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        res.redirect('/vault');
      });
    } catch {
      const freshConfig = db.getConfig();
      const newAttempts = (freshConfig.failed_attempts || 0) + 1;

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        db.lockVault(now + LOCKOUT_SECONDS);
        return res.render('unlock', {
          error: `Too many failed attempts. Vault locked for ${LOCKOUT_SECONDS / 60} minutes.`,
        });
      }

      db.incrementAttempts();
      const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
      return res.render('unlock', {
        error: `Wrong PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }
  }
);

// ── Logout ────────────────────────────────────────────────────────────────────

app.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.redirect('/unlock');
});

// ── Vault list ────────────────────────────────────────────────────────────────

app.get('/vault', requireAuth, (req, res) => {
  const key = getVaultKey(req);
  const entries = db
    .getAllEntries()
    .map((row) => {
      try {
        const data = JSON.parse(decrypt(key, row.encrypted_data));
        return { id: row.id, title: data.title || '', username: data.username || '', url: data.url || '', notes: data.notes || '', createdAt: row.created_at, updatedAt: row.updated_at };
      } catch { return null; }
    })
    .filter(Boolean);

  res.render('vault', { entries });
});

// ── Password API (for clipboard) ──────────────────────────────────────────────

app.get('/entry/:id/password', requireAuth, (req, res) => {
  const key = getVaultKey(req);
  const row = db.getEntry(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  try {
    const data = JSON.parse(decrypt(key, row.encrypted_data));
    return res.json({ password: data.password || '' });
  } catch {
    return res.status(500).json({ error: 'Decryption failed' });
  }
});

// ── New entry ─────────────────────────────────────────────────────────────────

const entryValidators = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required.'),
  body('username').trim().isLength({ max: 500 }).optional({ checkFalsy: true }),
  body('password').isLength({ max: 2000 }).optional({ checkFalsy: true }),
  body('url').trim().isLength({ max: 2000 }).optional({ checkFalsy: true }),
  body('notes').trim().isLength({ max: 5000 }).optional({ checkFalsy: true }),
];

app.get('/entry/new', requireAuth, (req, res) => {
  res.render('entry-form', { entry: null, action: '/entry/new', pageTitle: 'Add Entry', error: null });
});

app.post('/entry/new', requireAuth, entryValidators, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('entry-form', { entry: req.body, action: '/entry/new', pageTitle: 'Add Entry', error: errors.array()[0].msg });
  }
  const key = getVaultKey(req);
  const data = { title: req.body.title, username: req.body.username || '', password: req.body.password || '', url: req.body.url || '', notes: req.body.notes || '' };
  db.insertEntry(encrypt(key, JSON.stringify(data)));
  res.redirect('/vault');
});

// ── Edit entry ────────────────────────────────────────────────────────────────

app.get('/entry/:id/edit', requireAuth, (req, res) => {
  const key = getVaultKey(req);
  const row = db.getEntry(Number(req.params.id));
  if (!row) return res.status(404).render('error', { message: 'Entry not found.' });
  try {
    const data = JSON.parse(decrypt(key, row.encrypted_data));
    res.render('entry-form', { entry: { id: row.id, ...data }, action: `/entry/${row.id}/edit`, pageTitle: 'Edit Entry', error: null });
  } catch {
    res.status(500).render('error', { message: 'Failed to decrypt entry.' });
  }
});

app.post('/entry/:id/edit', requireAuth, entryValidators, (req, res) => {
  const id = Number(req.params.id);
  const row = db.getEntry(id);
  if (!row) return res.status(404).render('error', { message: 'Entry not found.' });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('entry-form', { entry: { id, ...req.body }, action: `/entry/${id}/edit`, pageTitle: 'Edit Entry', error: errors.array()[0].msg });
  }
  const key = getVaultKey(req);
  const data = { title: req.body.title, username: req.body.username || '', password: req.body.password || '', url: req.body.url || '', notes: req.body.notes || '' };
  db.updateEntry(id, encrypt(key, JSON.stringify(data)));
  res.redirect('/vault');
});

// ── Delete entry ──────────────────────────────────────────────────────────────

app.post('/entry/:id/delete', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!db.getEntry(id)) return res.status(404).render('error', { message: 'Entry not found.' });
  db.deleteEntry(id);
  res.redirect('/vault');
});

// ── Export (CSV download) ─────────────────────────────────────────────────────

app.post('/export', exportLimiter, requireAuth, (req, res) => {
  const key = getVaultKey(req);
  const entries = db
    .getAllEntries()
    .map((row) => {
      try { return JSON.parse(decrypt(key, row.encrypted_data)); }
      catch { return null; }
    })
    .filter(Boolean);

  // Build CSV (RFC 4180)
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [
    ['Title', 'Username', 'Password', 'URL', 'Notes'].map(esc).join(','),
    ...entries.map((e) => [e.title, e.username, e.password, e.url, e.notes].map(esc).join(',')),
  ].join('\r\n');

  const filename = `vault-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'An unexpected error occurred.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Vault running on http://localhost:${PORT}`);
  if (!IS_PROD) console.log('Development mode — set NODE_ENV=production for deployment.');
});
