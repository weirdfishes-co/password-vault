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

console.log('[db] Opening database at:', DB_PATH);
const dbFileExists = fs.existsSync(DB_PATH);
console.log('[db] Database file already existed:', dbFileExists);
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

const configRow = db.prepare('SELECT COUNT(*) as count FROM vault_config').get();
console.log('[db] Vault config rows in database:', configRow.count);

// node:sqlite prepared statements must NOT be cached at module level —
// they get garbage-collected and finalized between requests. Prepare per call.

module.exports = {
  getConfig: () =>
    db.prepare('SELECT * FROM vault_config WHERE id = 1').get(),

  insertConfig: (salt, verification) =>
    db.prepare('INSERT INTO vault_config (id, salt, verification) VALUES (1, ?, ?)').run(salt, verification),

  incrementAttempts: () =>
    db.prepare('UPDATE vault_config SET failed_attempts = failed_attempts + 1 WHERE id = 1').run(),

  lockVault: (lockedUntil) =>
    db.prepare('UPDATE vault_config SET locked_until = ?, failed_attempts = 0 WHERE id = 1').run(lockedUntil),

  resetAttempts: () =>
    db.prepare('UPDATE vault_config SET failed_attempts = 0, locked_until = NULL WHERE id = 1').run(),

  getAllEntries: () =>
    db.prepare('SELECT id, encrypted_data, created_at, updated_at FROM entries ORDER BY updated_at DESC').all(),

  getEntry: (id) =>
    db.prepare('SELECT id, encrypted_data, created_at, updated_at FROM entries WHERE id = ?').get(id),

  insertEntry: (encryptedData) =>
    db.prepare('INSERT INTO entries (encrypted_data) VALUES (?)').run(encryptedData),

  updateEntry: (id, encryptedData) =>
    db.prepare('UPDATE entries SET encrypted_data = ?, updated_at = unixepoch() WHERE id = ?').run(encryptedData, id),

  deleteEntry: (id) =>
    db.prepare('DELETE FROM entries WHERE id = ?').run(id),
};
