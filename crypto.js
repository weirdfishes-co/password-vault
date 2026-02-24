'use strict';

const crypto = require('crypto');

// scrypt parameters — memory-hard, ~1s on modest hardware
// Memory usage: 128 * N * r = 128 * 32768 * 8 = 32 MB
// maxmem is set explicitly to 64 MB (Node.js default is exactly 32 MB, which
// is too tight for N=32768/r=8 on memory-constrained hosts like Railway)
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

/**
 * Generate a cryptographically random 16-byte salt.
 * @returns {string} hex-encoded salt
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Derive a 256-bit master key from a PIN using scrypt (memory-hard KDF).
 * Built into Node.js — no native dependencies.
 * @param {string} pin - 6-digit PIN
 * @param {string} saltHex - hex-encoded salt
 * @returns {Promise<Buffer>} 32-byte derived key
 */
function deriveKey(pin, saltHex) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(pin, salt, KEY_LEN, SCRYPT_PARAMS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Stored format (base64url): nonce[12] + authTag[16] + ciphertext[n]
 * @param {Buffer} key - 32-byte AES key
 * @param {string} plaintext
 * @returns {string} base64url-encoded ciphertext blob
 */
function encrypt(key, plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, authTag, encrypted]).toString('base64url');
}

/**
 * Decrypt an AES-256-GCM ciphertext blob.
 * Throws if the key is wrong or data is tampered with.
 * @param {Buffer} key - 32-byte AES key
 * @param {string} ciphertextB64 - base64url-encoded blob
 * @returns {string} decrypted plaintext
 */
function decrypt(key, ciphertextB64) {
  const data = Buffer.from(ciphertextB64, 'base64url');
  if (data.length < 28) throw new Error('Ciphertext too short');
  const nonce = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
}

module.exports = { generateSalt, deriveKey, encrypt, decrypt };
