/* Password-derived keys and authenticated decryption for bundled patterns. */
(() => {
  'use strict';
  const base64Bytes = encoded => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  const authSettings = () => window.SUNBEAM_AUTH_CONFIG;
  async function derivePasswordKey(password) {
    const config = authSettings();
    if (!config || !crypto?.subtle) throw Error('Secure login requires HTTPS and a modern browser.');
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey({
      name: 'PBKDF2', salt: base64Bytes(config.salt),
      iterations: config.iterations, hash: 'SHA-256'
    }, material, {name: 'AES-GCM', length: 256}, false, ['decrypt']);
  }
  async function unwrapPrivatePatternKey(loginKey) {
    const config = authSettings();
    const raw = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: base64Bytes(config.iv),
      additionalData: new TextEncoder().encode('sunbeam-art-auth-v1')
    }, loginKey, base64Bytes(config.wrappedKey));
    return crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
  }
  async function decryptGuide(item, patternKey, loginKey) {
    if (item.format === 'gzip+aes-256-gcm' && !window.DecompressionStream) {
      throw Error('This browser version cannot unpack private patterns. Update Safari or Chrome.');
    }
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: base64Bytes(item.iv),
      additionalData: new TextEncoder().encode(item.aad || 'sunbeam-art-tooth-v1')
    }, item.keySource === 'login' ? loginKey : patternKey, base64Bytes(item.ciphertext));
    const json = item.format === 'aes-256-gcm'
      ? new TextDecoder().decode(plaintext)
      : await new Response(
          new Blob([plaintext]).stream().pipeThrough(new DecompressionStream('gzip'))
        ).text();
    return JSON.parse(json);
  }
  window.SunbeamCrypto = Object.freeze({
    derivePasswordKey, unwrapPrivatePatternKey, decryptGuide
  });
})();
