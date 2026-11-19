// Password-based encryption for the table data, using the browser's Web Crypto API.
// PBKDF2-SHA256 derives an AES-256-GCM key from the password.
// Only the encrypted payload (data.enc.json) is published.
const RowCrypto = (() => {
  "use strict";

  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      base,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  async function encrypt(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, ITERATIONS);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
    return { v: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }

  async function encryptWithKey(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  async function decryptWithKey(payload, key) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(payload.iv) }, key, fromB64(payload.ct));
    return JSON.parse(dec.decode(pt));
  }

  // Returns { data, key }. Throws if the password is wrong.
  async function unlock(payload, password) {
    const key = await deriveKey(password, fromB64(payload.salt), payload.iterations);
    return { data: await decryptWithKey(payload, key), key };
  }

  async function exportKey(key) {
    return toB64(await crypto.subtle.exportKey("raw", key));
  }

  async function importKey(b64) {
    return crypto.subtle.importKey("raw", fromB64(b64), "AES-GCM", true, ["encrypt", "decrypt"]);
  }

  return { encrypt, encryptWithKey, unlock, decryptWithKey, exportKey, importKey };
})();
