/* Device-local encrypted guide storage and progress. No guide plaintext is written to IndexedDB. */
(() => {
  'use strict';
  const DB = 'kimsi-cozy-guides-v1';
  const STORE = 'guides';
  const AUTH_DB = 'sunbeam-art-login-v1';
  const AUTH_STORE = 'auth';
  let guideKey = null, progressUser = null, progressChange = 0;
  const saveKey = id => 'kimsi-progress:' + id;
  const scopedKey = id => progressUser ? 'sunbeam-progress:' + progressUser + ':' + id : saveKey(id);
  const dirtyKey = id => progressUser ? 'sunbeam-dirty:' + progressUser + ':' + id : null;
  function setProgressUser(id, migrateLegacy=false) {
    progressUser = typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    if(!progressUser || !migrateLegacy)return;
    // Only the approved owner may import Kimsi's existing unsynced iPad history.
    const oldKeys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key && key.startsWith('kimsi-progress:'))oldKeys.push(key);
    }
    for(const key of oldKeys){
      const id=key.slice('kimsi-progress:'.length);
      const target=scopedKey(id);
      if(!localStorage.getItem(target) && localStorage.getItem(key)){
        localStorage.setItem(target,localStorage.getItem(key));
        localStorage.setItem(dirtyKey(id),'bootstrap');
      }
    }
  }
  function getProgressRecord(id){
    const data=localStorage.getItem(scopedKey(id));
    let progress=null;
    try{progress=data?JSON.parse(data):null}catch{}
    return {present:!!progress&&typeof progress==='object'&&!Array.isArray(progress),
      progress,dirty:dirtyKey(id)?localStorage.getItem(dirtyKey(id)):null};
  }
  function applyCloudProgress(id,cloud){
    if(!progressUser||!cloud||typeof cloud!=='object'||Array.isArray(cloud))return;
    localStorage.setItem(scopedKey(id),JSON.stringify(cloud));
    localStorage.removeItem(dirtyKey(id));
  }
  function markProgressSynced(id,expected){
    if(progressUser && localStorage.getItem(dirtyKey(id))===expected)
      localStorage.removeItem(dirtyKey(id));
  }
  const baseProgress = () => ({done: {}, materials: {}, earOption: '2', variantOption: 'solid', lastStep: null, updatedAt: null});

  function loadProgress(id) {
    try { return {...baseProgress(), ...JSON.parse(localStorage.getItem(scopedKey(id)) || '{}')}; }
    catch { return baseProgress(); }
  }
  function persistProgress(id, progress) {
    localStorage.setItem(scopedKey(id), JSON.stringify(progress));
    if(progressUser)localStorage.setItem(dirtyKey(id),'local:'+Date.now()+':'+(++progressChange));
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
  function listStoredIds(){
 return dbOpen().then(db=>new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly');
   const request=tx.objectStore(STORE).getAllKeys();
   request.onsuccess=()=>resolve((request.result||[]).map(String));
   request.onerror=()=>reject(request.error);
   tx.oncomplete=()=>db.close();
   tx.onerror=()=>db.close();
 }));
}
  async function getGuide(id){
 const db=await dbOpen();
 const record=await new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly');
   const request=tx.objectStore(STORE).get(id);
   request.onsuccess=()=>resolve(request.result||null);
   request.onerror=()=>reject(request.error);
   tx.oncomplete=()=>db.close();
   tx.onerror=()=>db.close();
 });
 if(!record)return null;
 const guide=await decryptRecord(record);
 if(!record.ciphertext) await storeGuide(guide);
 return guide;
}

  const PREVIEW_DB='sunbeam-art-previews-v1';
  const PREVIEW_STORE='previews';
  function previewsDbOpen(){return openDb(PREVIEW_DB,PREVIEW_STORE,'id')}
  async function storePreview(id,image){
    requireGuideKey();
    if(typeof id!=='string'||!/^[a-z0-9-]{2,80}$/.test(id)||
      typeof image!=='string'||!/^data:image\/(jpeg|png|webp);base64,/i.test(image))
      throw Error('Invalid pattern preview');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({
      name:'AES-GCM',iv,
      additionalData:new TextEncoder().encode('sunbeam-preview:'+id)
    },requireGuideKey(),new TextEncoder().encode(image));
    const db=await previewsDbOpen();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(PREVIEW_STORE,'readwrite');
      tx.objectStore(PREVIEW_STORE).put({id,iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(ciphertext))});
      tx.oncomplete=()=>{db.close();resolve()};
      tx.onerror=()=>{db.close();reject(tx.error)};
    });
  }
  async function getPreviews(){
    requireGuideKey();
    const db=await previewsDbOpen();
    const records=await new Promise((resolve,reject)=>{
      const tx=db.transaction(PREVIEW_STORE,'readonly');
      const request=tx.objectStore(PREVIEW_STORE).getAll();
      request.onsuccess=()=>resolve(request.result||[]);
      request.onerror=()=>reject(request.error);
      tx.oncomplete=()=>db.close();
      tx.onerror=()=>db.close();
    });
    const previews={};
    for(const record of records){
      try{
        const plain=await crypto.subtle.decrypt({
          name:'AES-GCM',iv:fromBase64(record.iv),
          additionalData:new TextEncoder().encode('sunbeam-preview:'+record.id)
        },requireGuideKey(),fromBase64(record.ciphertext));
        const image=new TextDecoder().decode(plain);
        if(/^data:image\/(jpeg|png|webp);base64,/i.test(image))previews[record.id]=image;
      }catch{/* Ignore broken previews without affecting the actual guide. */}
    }
    return previews;
  }
  window.SunbeamStorage = Object.freeze({
    saveKey, baseProgress, loadProgress, persistProgress,
    setProgressUser, getProgressRecord, applyCloudProgress, markProgressSynced,
    setGuideKey, getAllGuides, storeGuide, getGuide, listStoredIds, storePreview, getPreviews, savedAuthKey, rememberAuthKey, forgetAuthKey
  });
})();
