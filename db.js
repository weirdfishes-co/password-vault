'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vault.db');

// Ensure directory exists (e.g. Railway /data volume)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Performance + integrity settings
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA synchronous = NORMAL');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS vault_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    salt TEXT NOT NULL,
    verification TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    encrypted_data TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── vault_config helpers ─────────────────────────────────────────────────────

const stmtGetConfig = db.prepare('SELECT * FROM vault_config WHERE id = 1');
const stmtInsertConfig = db.prepare(
  'INSERT INTO vault_config (id, salt, verification) VALUES (1, ?, ?)'
);
const stmtIncrementAttempts = db.prepare(
  'UPDATE vault_config SET failed_attempts = failed_attempts + 1 WHERE id = 1'
);
const stmtLockVault = db.prepare(
  'UPDATE vault_config SET locked_until = ?, failed_attempts = 0 WHERE id = 1'
);
const stmtResetAttempts = db.prepare(
  'UPDATE vault_config SET failed_attempts = 0, locked_until = NULL WHERE id = 1'
);

// ── entries helpers ──────────────────────────────────────────────────────────

const stmtGetAllEntries = db.prepare(
  'SELECT id, encrypted_data, created_at, updated_at FROM entries ORDER BY updated_at DESC'
);
const stmtGetEntry = db.prepare(
  'SELECT id, encrypted_data, created_at, updated_at FROM entries WHERE id = ?'
);
const stmtInsertEntry = db.prepare('INSERT INTO entries (encrypted_data) VALUES (?)');
const stmtUpdateEntry = db.prepare(
  'UPDATE entries SET encrypted_data = ?, updated_at = unixepoch() WHERE id = ?'
);
const stmtDeleteEntry = db.prepare('DELETE FROM entries WHERE id = ?');

module.exports = {
  getConfig: () => stmtGetConfig.get(),
  insertConfig: (salt, verification) => stmtInsertConfig.run(salt, verification),
  incrementAttempts: () => stmtIncrementAttempts.run(),
  lockVault: (lockedUntil) => stmtLockVault.run(lockedUntil),
  resetAttempts: () => stmtResetAttempts.run(),

  getAllEntries: () => stmtGetAllEntries.all(),
  getEntry: (id) => stmtGetEntry.get(id),
  insertEntry: (encryptedData) => stmtInsertEntry.run(encryptedData),
  updateEntry: (id, encryptedData) => stmtUpdateEntry.run(encryptedData, id),
  deleteEntry: (id) => stmtDeleteEntry.run(id),
};
