/* Private library key escrow: browser-side AES-GCM envelope, keyed by each user's
   Supabase password. The prior pattern password is needed only once to migrate.
   Neither plaintext keys nor either password are sent to Supabase. */
(() => {
  'use strict';
  const enc=new TextEncoder();
  const decode=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const encode=bytes=>{
    let out='';
    for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out);
  };
  const isUid=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);
  const aad=id=>enc.encode('sunbeam-private-library:'+id+':v1');
  async function legacyBytes(password){
    const cfg=window.SUNBEAM_AUTH_CONFIG;
    if(!cfg||!crypto?.subtle)throw Error('A secure browser connection is required.');
    const input=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({
      name:'PBKDF2',salt:decode(cfg.salt),iterations:cfg.iterations,hash:'SHA-256'
    },input,256));
  }
  async function importLegacy(bytes){
    return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['decrypt']);
  }
  async function wrappingKey(password,salt){
    const raw=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({
      name:'PBKDF2',salt,iterations:410000,hash:'SHA-256'
    },raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function enroll(accountPassword,patternPassword,userId){
    if(!accountPassword||!patternPassword||!isUid(userId))throw Error('Please fill in both passwords.');
    const bytes=await legacyBytes(patternPassword);
    const legacyKey=await importLegacy(bytes);
    // Verify the old password against the existing encrypted master before
    // uploading an envelope. An incorrect password can never lock the user out.
    await window.SunbeamCrypto.unwrapPrivatePatternKey(legacyKey);
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await wrappingKey(accountPassword,salt);
    const wrapped=await crypto.subtle.encrypt({
      name:'AES-GCM',iv,additionalData:aad(userId)
    },key,bytes);
    bytes.fill(0);
    return {envelope:{version:'1',kdf:'PBKDF2-SHA256',iterations:410000,
      cipher:'AES-256-GCM',salt:encode(salt),iv:encode(iv),
      ciphertext:encode(new Uint8Array(wrapped))},legacyKey};
  }
  async function unlock(envelope,accountPassword,userId){
    if(!accountPassword||!isUid(userId)||envelope?.version!=='1'||
       envelope.kdf!=='PBKDF2-SHA256'||envelope.cipher!=='AES-256-GCM'||
       envelope.iterations!==410000)throw Error('The private library key is not configured.');
    const salt=decode(envelope.salt),iv=decode(envelope.iv);
    if(salt.length!==16||iv.length!==12)throw Error('Invalid library key.');
    const key=await wrappingKey(accountPassword,salt);
    let decrypted;
    try{
      decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(userId)},
        key,decode(envelope.ciphertext));
    }catch{throw Error('Could not unlock your library. If you changed the account password, ask for a key reset.')}
    const bytes=new Uint8Array(decrypted);
    if(bytes.length!==32)throw Error('Invalid private library key.');
    const legacyKey=await importLegacy(bytes);
    bytes.fill(0);
    await window.SunbeamCrypto.unwrapPrivatePatternKey(legacyKey);
    return legacyKey;
  }
  window.SunbeamKeyring=Object.freeze({enroll,unlock});
})();