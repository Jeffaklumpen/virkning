/* Yarn Colorways API v3: two-level caching.
  1) this browser's IndexedDB and in-memory cache
  2) the authenticated Supabase Edge Function's shared Postgres response cache
  No API key or external fetch occurs in browser. */
(() => {
  'use strict';
  const DB='sunbeam-yarn-search-cache-v1',STORE='api-responses';
  const TTL_CATALOG=14*86400000,TTL_COLORS=30*86400000;
  const memory=new Map(),pending=new Map();
  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE,{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Yarn cache is not available'));
    });
  }
  async function read(key){
    if(memory.has(key))return memory.get(key);
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(key);
      req.onsuccess=()=>{
        if(req.result)memory.set(key,req.result);
        resolve(req.result||null);
      };
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();
      tx.onerror=()=>db.close();
    });
  }
  async function write(key,items){
    const item={key,items,at:Date.now()};
    memory.set(key,item);
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete=()=>{db.close();resolve()};
      tx.onerror=()=>{db.close();reject(tx.error)};
    });
  }
  async function get(key,ttl,params){
    if(pending.has(key))return pending.get(key);
    const job=(async()=>{
      let cached=null;
      try{cached=await read(key)}catch{}
      if(cached?.items&&Date.now()-cached.at<ttl)
        return {items:cached.items,from:'device'};
      try{
        const fresh=await window.SunbeamCloud.yarnLookup(params);
        if(!Array.isArray(fresh.items))throw Error('Invalid response from Colorways');
        await write(key,fresh.items).catch(()=>{});
        return {items:fresh.items,from:fresh.cache||'live',warning:fresh.warning||''};
      }catch(error){
        if(cached?.items)return {items:cached.items,from:'offline',warning:'Using saved yarn results while offline.'};
        throw error;
      }
    })().finally(()=>pending.delete(key));
    pending.set(key,job);
    return job;
  }
  function catalog(){return get('catalog:v3',TTL_CATALOG,{type:'catalog'})}
  function colors(brandId,yarnId){
    if(!/^[a-z0-9_-]{1,65}$/.test(brandId)||!/^[a-z0-9_-]{1,65}$/.test(yarnId))
      return Promise.reject(Error('Invalid yarn selection'));
    return get('colors:v3:'+brandId+':'+yarnId,TTL_COLORS,
      {type:'colors',brand:brandId,yarn:yarnId});
  }
  function search(items,query){
    const q=String(query||'').trim().toLocaleLowerCase();
    if(q.length<2)return [];
    const words=q.split(/\s+/).filter(Boolean);
    return items.filter(item=>{
      const label=(item.brandName+' '+item.yarnName).toLocaleLowerCase();
      return words.every(word=>label.includes(word));
    }).sort((a,b)=>{
      const ta=a.yarnName.toLocaleLowerCase(),tb=b.yarnName.toLocaleLowerCase();
      const ra=ta.startsWith(q)?0:ta.includes(q)?1:2;
      const rb=tb.startsWith(q)?0:tb.includes(q)?1:2;
      return ra-rb||ta.localeCompare(tb);
    }).slice(0,40);
  }
  window.SunbeamYarnCatalog=Object.freeze({catalog,colors,search});
})();