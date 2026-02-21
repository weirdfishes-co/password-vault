'use strict';

const crypto = require('crypto');
const argon2 = require('argon2');

// Argon2id parameters — tuned for ~1s on modest hardware
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536, // 64 MB
  parallelism: 4,
  hashLength: 32,
  raw: true, // return raw Buffer instead of encoded hash string
};

/**
 * Generate a cryptographically random 16-byte salt.
 * @returns {string} hex-encoded salt
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Derive a 256-bit master key from a PIN using Argon2id.
 * @param {string} pin - 6-digit PIN
 * @param {string} saltHex - hex-encoded salt
 * @returns {Promise<Buffer>} 32-byte derived key
 */
async function deriveKey(pin, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return argon2.hash(pin, { ...ARGON2_OPTIONS, salt });
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
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16 bytes by default
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
