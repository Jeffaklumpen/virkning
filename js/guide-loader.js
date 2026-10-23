/* Tiny public pattern catalogue + on-demand ciphertext loading. No private instructions. */
(() => {
  'use strict';
  let metadataPromise=null,queue=Promise.resolve();
  const inflight=new Map();
  async function catalog(){
    if(!metadataPromise) metadataPromise=fetch('./data/pattern-catalog.json').then(response=>{
      if(!response.ok)throw Error('Could not load the pattern catalogue');
      return response.json();
    }).then(entries=>{
      if(!Array.isArray(entries))throw Error('Invalid pattern catalogue');
      const ids=new Set();
      return entries.map(entry=>{
        if(!entry || !/^[a-z0-9-]{2,80}$/.test(entry.id) ||
          typeof entry.title!=='string' || !Array.isArray(entry.assets) ||
          !entry.assets.length || ids.has(entry.id) ||
          !entry.assets.every(path=>/^data\/encrypted\/[a-z0-9-/]+\.js$/.test(path)))
          throw Error('Invalid catalogue entry');
        ids.add(entry.id);
        return Object.freeze({...entry,assets:Object.freeze([...entry.assets])});
      });
    }).catch(error=>{metadataPromise=null;throw error});
    return metadataPromise;
  }
  function appendScript(path,revision){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.async=false; // Dynamic classic scripts execute in insertion order.
      script.src='./'+path+'?v='+encodeURIComponent(revision);
      script.onload=()=>{script.remove();resolve()};
      script.onerror=()=>{script.remove();reject(Error('Could not download '+path))};
      document.head.appendChild(script);
    });
  }
  async function download(entry){
    window.SUNBEAM_ENCRYPTED_GUIDES=[];
    // Requests overlap; execution stays ordered because async=false.
    await Promise.all(entry.assets.map(path=>appendScript(path,entry.revision)));
    const payload=(window.SUNBEAM_ENCRYPTED_GUIDES||[]).find(item=>
      item.id===entry.id && Number(item.revision||1)>=Number(entry.revision||1));
    window.SUNBEAM_ENCRYPTED_GUIDES=[];
    if(!payload)throw Error('Pattern download was incomplete or out of date');
    return payload;
  }
  function load(entry){
    if(inflight.has(entry.id))return inflight.get(entry.id);
    // Serialize guides: legacy Little Tooth assigns the shared payload array.
    const job=queue.catch(()=>{}).then(()=>download(entry));
    queue=job.then(()=>{},()=>{});
    inflight.set(entry.id,job);
    job.finally(()=>inflight.delete(entry.id)).catch(()=>{});
    return job;
  }
  window.SunbeamGuides=Object.freeze({catalog,load});
})();
