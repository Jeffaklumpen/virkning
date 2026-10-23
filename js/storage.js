/* Device-local encrypted guide storage and progress. No guide plaintext is written to IndexedDB. */
(() => {
  'use strict';
  const DB = 'kimsi-cozy-guides-v1';
  const STORE = 'guides';
  const AUTH_DB = 'sunbeam-art-login-v1';
  const AUTH_STORE = 'auth';
  let guideKey = null;
  const saveKey = id => 'kimsi-progress:' + id;
  const baseProgress = () => ({done: {}, materials: {}, earOption: '2', lastStep: null, updatedAt: null});

  function loadProgress(id) {
    try { return {...baseProgress(), ...JSON.parse(localStorage.getItem(saveKey(id)) || '{}')}; }
    catch { return baseProgress(); }
  }
  function persistProgress(id, progress) {
    localStorage.setItem(saveKey(id), JSON.stringify(progress));
  }
  function openDb(name, store, keyPath) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(store)) {
          request.result.createObjectStore(store, keyPath ? {keyPath} : undefined);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local database unavailable'));
    });
  }
  function dbOpen() { return openDb(DB, STORE, 'id'); }
  function authDbOpen() { return openDb(AUTH_DB, AUTH_STORE); }
  function setGuideKey(key) { guideKey = key; }
  function requireGuideKey() {
    if (!guideKey) throw new Error('Sign in before opening private patterns');
    return guideKey;
  }
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    }
    return btoa(binary);
  }
  function fromBase64(encoded) {
    return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  }
  async function decryptRecord(record) {
    if (!record.ciphertext || !record.iv) return record; // Legacy plaintext, migrated on first successful login.
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: fromBase64(record.iv),
      additionalData: new TextEncoder().encode('sunbeam-local-guide:' + record.id)
    }, requireGuideKey(), fromBase64(record.ciphertext));
    const guide = JSON.parse(new TextDecoder().decode(plaintext));
    if (!guide || guide.id !== record.id || !Array.isArray(guide.groups)) {
      throw new Error('Private guide could not be verified');
    }
    return guide;
  }
  async function readRecords() {
    const db = await dbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }
  async function storeGuide(guide) {
    const key = requireGuideKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = new TextEncoder().encode(JSON.stringify(guide));
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv,
      additionalData: new TextEncoder().encode('sunbeam-local-guide:' + guide.id)
    }, key, payload);
    const sealed = {
      id: guide.id,
      revision: guide.revision || 1,
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext))
    };
    const db = await dbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(sealed);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function getAllGuides() {
    requireGuideKey();
    const records = await readRecords();
    const guides = [];
    for (const record of records) {
      const guide = await decryptRecord(record);
      guides.push(guide);
      if (!record.ciphertext) await storeGuide(guide); // In-place safe migration of old local copies.
    }
    return guides;
  }
  async function savedAuthKey() {
    const db = await authDbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUTH_STORE, 'readonly');
      const request = tx.objectStore(AUTH_STORE).get('remembered-key');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }
  async function rememberAuthKey(key) {
    const db = await authDbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUTH_STORE, 'readwrite');
      tx.objectStore(AUTH_STORE).put(key, 'remembered-key');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function forgetAuthKey() {
    try {
      const db = await authDbOpen();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUTH_STORE, 'readwrite');
        tx.objectStore(AUTH_STORE).delete('remembered-key');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    } catch { /* Requiring a password again is the safe fallback. */ }
  }
  window.SunbeamStorage = Object.freeze({
    saveKey, baseProgress, loadProgress, persistProgress,
    setGuideKey, getAllGuides, storeGuide, savedAuthKey, rememberAuthKey, forgetAuthKey
  });
})();
