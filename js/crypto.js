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

  // The old public plaintext source is re-encrypted with a public-only RSA
  // envelope in CI. The RSA private key is AES-GCM wrapped with the same
  // password-derived login key; the private key/password never go to CI.
  const privateKeyCache=new WeakMap();
  async function donutPrivateKey(loginKey){
    if(!loginKey)throw Error('Sign in before opening this guide');
    if(!privateKeyCache.has(loginKey)){
      const promise=(async()=>{
        const response=await fetch('./config/donut-envelope.json');
        if(!response.ok)throw Error('Could not load private guide key');
        const wrapped=await response.json();
        if(wrapped?.version!==1||wrapped?.alg!=='RSA-OAEP-256')throw Error('Invalid private guide key');
        const pkcs8=await crypto.subtle.decrypt({
          name:'AES-GCM',iv:base64Bytes(wrapped.iv),
          additionalData:new TextEncoder().encode('sunbeam-donut-key:v1')
        },loginKey,base64Bytes(wrapped.ciphertext));
        return crypto.subtle.importKey('pkcs8',pkcs8,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
      })().catch(error=>{privateKeyCache.delete(loginKey);throw error});
      privateKeyCache.set(loginKey,promise);
    }
    return privateKeyCache.get(loginKey);
  }
  async function donutSessionKey(item,loginKey){
    if(item.keySource!=='donut-rsa'||typeof item.wrappedSessionKey!=='string')
      throw Error('Invalid private guide envelope');
    const privateKey=await donutPrivateKey(loginKey);
    const raw=await crypto.subtle.decrypt(
      {name:'RSA-OAEP'},privateKey,base64Bytes(item.wrappedSessionKey)
    );
    return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
  }

  async function decryptGuide(item, patternKey, loginKey) {
    if (String(item.format).startsWith('gzip+') && !window.DecompressionStream) {
      throw Error('This browser version cannot unpack private patterns. Update Safari or Chrome.');
    }
    const key = item.keySource === 'donut-rsa'
      ? await donutSessionKey(item, loginKey)
      : item.keySource === 'login' ? loginKey : patternKey;
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: base64Bytes(item.iv),
      additionalData: new TextEncoder().encode(item.aad || 'sunbeam-art-tooth-v1')
    }, key, base64Bytes(item.ciphertext));
    const json = item.format === 'aes-256-gcm'
      ? new TextDecoder().decode(plaintext)
      : await new Response(
          new Blob([plaintext]).stream().pipeThrough(new DecompressionStream('gzip'))
        ).text();
    return JSON.parse(json);
  }
  async function decryptCover(item, id, loginKey) {
    if (!item || typeof item.iv !== 'string' || typeof item.ciphertext !== 'string' ||
        typeof id !== 'string' || !/^[a-z0-9-]{2,80}$/.test(id)) {
      throw Error('Invalid encrypted cover');
    }
    const key = item.keySource === 'donut-rsa'
      ? await donutSessionKey(item,loginKey) : loginKey;
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: base64Bytes(item.iv),
      additionalData: new TextEncoder().encode('sunbeam-cover:' + id + ':v1')
    }, key, base64Bytes(item.ciphertext));
    const cover = new TextDecoder().decode(plaintext);
    const prefixes = ['data:image/webp;base64,', 'data:image/png;base64,', 'data:image/jpeg;base64,'];
    const encoded = cover.substring(cover.indexOf(',') + 1);
    if (!prefixes.some(prefix => cover.startsWith(prefix)) || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
      throw Error('Invalid cover image');
    }
    return cover;
  }
  window.SunbeamCrypto = Object.freeze({
    derivePasswordKey, unwrapPrivatePatternKey, decryptGuide, decryptCover
  });
})();
