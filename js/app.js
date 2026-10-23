/* Sunbeam Art — Kimsi's crochet companion. Keep the existing local progress store unchanged. */
(() => {
  'use strict';
  const $=(s)=>document.querySelector(s);
  const el=$('#app');
  const modal=$('#modal-root');
  let patterns=[], loadedPatterns=new Map(), activeId=null, activeStep=null, activeGroup=null, progress={}, authKey=null, patternKey=null, loadingToken=0, previewImages=new Map(), photoSweepId=0, overviewOpen=false;
  const {esc, icon, picture, validPattern, stepsFor, groupSteps, stats} = window.SunbeamPatterns;
  const {baseProgress, loadProgress, persistProgress, setGuideKey,
    getGuide, listStoredIds, storeGuide, storePreview, getPreviews, savedAuthKey, rememberAuthKey, forgetAuthKey} = window.SunbeamStorage;
  const {derivePasswordKey, unwrapPrivatePatternKey, decryptGuide} = window.SunbeamCrypto;
  const {estimateTime} = window.SunbeamEstimates;
  function persist() {
    progress.updatedAt = new Date().toISOString();
    persistProgress(activeId, progress);
  }
  function getPattern(){return loadedPatterns.get(activeId)}
  function toast(message){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),2900)}

  // One password unlocks bundled ciphertexts; login can be remembered on-device.
  function renderLogin(message=''){
  activeId=null;activeStep=null;
  el.innerHTML=window.SunbeamViews.login(message);
  el.querySelector('#sunbeam-login-form')?.addEventListener('submit',event=>{
    event.preventDefault();
    signInWithPassword();
  });
}
  async function enterLibrary(loginKey){
  const key=await unwrapPrivatePatternKey(loginKey);
  setGuideKey(key);
  const [entries,localIds,previews]=await Promise.all([window.SunbeamGuides.catalog(),listStoredIds(),getPreviews().catch(()=>({}))]);
  const known=new Set(entries.map(e=>e.id));
  // Hide the retired pattern without touching IndexedDB records or saved progress.
  const local=localIds.filter(id=>id!=='donut-kitty'&&!known.has(id))
    .map(id=>({id,title:id.replace(/-/g,' '),designer:'My pattern',localOnly:true}));
  patterns=[...entries,...local];
  loadedPatterns=new Map();
  previewImages=new Map(Object.entries(previews));
  patternKey=key;authKey=loginKey;
  renderLibrary();
  void populateEncryptedCoverPhotos();
}
  async function signInWithPassword(){
    const field=el.querySelector('#sunbeam-password');
    const message=el.querySelector('#sunbeam-login-error');
    const submit=el.querySelector('#sunbeam-login-submit');
    const password=field?.value||'';
    if(!password)return;
    if(submit){submit.disabled=true;submit.textContent='Opening your hive…'}
    if(message)message.textContent='';
    try{
      const loginKey=await derivePasswordKey(password);
      // Decrypt first: a wrong password never grants access.
      await enterLibrary(loginKey);
      try{await rememberAuthKey(loginKey)}catch(error){toast('Signed in ♡ Your browser could not remember this login.')}
    }catch(error){
      if(message)message.textContent=(String(error.message||'').includes('browser')||String(error.message||'').includes('HTTPS'))?error.message:'That password wasn’t quite right. Please try again ♡';
      if(submit){submit.disabled=false;submit.textContent='Open my little hive ➜'}
      field?.focus();
    }
  }

  function renderLibrary(){
  overviewOpen=false;
  if(!authKey)return renderLogin();
  loadingToken++;activeId=null;activeStep=null;
  const started=patterns.map(meta=>{
    const p=loadedPatterns.get(meta.id)||(previewImages.has(meta.id)?{...meta,preview:previewImages.get(meta.id)}:meta);
    const pr=loadProgress(meta.id);
    const n=loadedPatterns.has(meta.id)?stats(p,pr):(pr.knownStats||{total:0,complete:0,percent:0});
    return {p,pr,n,time:estimateTime(p,pr)};
  }).sort((a,b)=>(b.pr.updatedAt||'').localeCompare(a.pr.updatedAt||''));
  el.innerHTML=window.SunbeamViews.library(started,patterns.length);
  window.scrollTo({top:0,behavior:'instant'});
}
  function renderGuide(stepId){
  overviewOpen=false;
  const p=getPattern();if(!p)return renderLibrary();
  const all=stepsFor(p,progress);if(!all.length)return renderLibrary();
  if(stepId && all.some(s=>s.id===stepId))activeStep=stepId;
  else if(!activeStep||!all.some(s=>s.id===activeStep))
    activeStep=progress.lastStep&&all.some(s=>s.id===progress.lastStep)?progress.lastStep:all[0].id;
  const step=all.find(s=>s.id===activeStep);
  activeGroup=step.groupId;progress.lastStep=activeStep;
  const st=stats(p,progress);progress.knownStats=st;persist();
  const idx=all.findIndex(s=>s.id===step.id);
  el.innerHTML=window.SunbeamViews.guide(p,progress,activeGroup,activeStep,step,all,st,idx);
  document.getElementById('chapter-select')?.addEventListener('change',e=>jumpGroup(e.target.value));
  window.scrollTo({top:0,behavior:'instant'});
}

  function updateOverviewTopButton(){
    if(!overviewOpen)return;
    const button=el.querySelector('.overview-to-top');
    if(button)button.hidden=window.scrollY<480;
  }
  // Passive scroll listener: no rerendering of long guides or image galleries.
  window.addEventListener('scroll',updateOverviewTopButton,{passive:true});
  function renderOverview(){
    const p=getPattern();
    if(!p||!authKey)return renderLibrary();
    overviewOpen=true;
    el.innerHTML=window.SunbeamOverview.render(p,progress,activeStep);
    window.scrollTo({top:0,behavior:'instant'});
    updateOverviewTopButton();
  }
  function returnToGuide(){
    if(!overviewOpen)return;
    renderGuide(activeStep);
  }

  function jumpGroup(id){const p=getPattern(),group=p?.groups.find(x=>x.id===id);if(!group)return;const step=groupSteps(p,group,progress)[0];if(step)renderGuide(step.id)}
  function jump(delta){const p=getPattern(),all=stepsFor(p,progress),i=all.findIndex(x=>x.id===activeStep);if(i<0)return; if(delta>0){progress.done[activeStep]=true;persist();}const next=all[Math.max(0,Math.min(all.length-1,i+delta))];if(delta>0&&i===all.length-1)return showFinished();renderGuide(next.id)}
  function showFinished(){
  const p=getPattern(),st=stats(p,progress);
  el.innerHTML=window.SunbeamViews.finished(p,st);
  window.scrollTo(0,0);
}
  // Guide loading is shared by clicks and automatic cover-photo hydration.
  async function readAvailableGuide(entry){
    let guide=null;
    try { guide=await getGuide(entry.id) } catch(error) {
      // Older on-device copies can be corrupt after a legacy encryption upgrade.
      // Bundled guides can be re-downloaded without changing progress.
      if(!entry.assets)throw error;
    }
    if(entry.assets&&(!guide||Number(guide.revision||1)<Number(entry.revision||1))){
      try{
        const encrypted=await window.SunbeamGuides.load(entry);
        const fresh=await decryptGuide(encrypted,patternKey,authKey);
        if(!validPattern(fresh)||fresh.id!==entry.id)throw Error('Invalid private pattern file');
        guide={...fresh,revision:Math.max(Number(fresh.revision||1),Number(entry.revision||1))};
        await storeGuide(guide);
      }catch(error){if(!guide)throw error}
    }
    if(!validPattern(guide))throw Error('Guide not found on this device');
    return guide;
  }

  async function saveRealPhotoPreview(id,guide){
    if(previewImages.has(id))return previewImages.get(id);
    const thumbnail=await window.SunbeamPreviews.create(guide);
    if(!thumbnail)return null;
    await storePreview(id,thumbnail);
    previewImages.set(id,thumbnail);
    const card=[...document.querySelectorAll('.pattern-card')].find(node=>node.dataset.id===id);
    const pending=card?.querySelector('.real-photo-pending');
    if(pending){
      const img=document.createElement('img');
      img.alt=guide.title||'Original pattern photograph';
      img.loading='lazy';
      img.src=thumbnail;
      pending.replaceWith(img);
    }
    return thumbnail;
  }

  // Small, separately encrypted original covers replace the old full-guide
  // background downloads. Failure only leaves a placeholder; opening a guide
  // always remains independent of the cover bundle.
  async function populateEncryptedCoverPhotos(){
    const run=++photoSweepId;
    const missing=patterns.filter(entry=>entry.assets&&!previewImages.has(entry.id));
    if(!missing.length)return;
    let bundle;
    try{
      const response=await fetch('./data/encrypted/cover-previews.json');
      if(!response.ok)throw Error('Cover previews unavailable');
      bundle=await response.json();
      if(bundle?.version!==1||!bundle.covers||typeof bundle.covers!=='object')return;
    }catch{return}
    for(const entry of missing){
      if(run!==photoSweepId||!authKey)return;
      const encrypted=bundle.covers[entry.id];
      if(!encrypted||previewImages.has(entry.id))continue;
      try{
        const thumbnail=await window.SunbeamCrypto.decryptCover(encrypted,entry.id,authKey);
        if(run!==photoSweepId||!authKey)return;
        previewImages.set(entry.id,thumbnail);
        const card=[...document.querySelectorAll('.pattern-card')].find(node=>node.dataset.id===entry.id);
        const pending=card?.querySelector('.real-photo-pending');
        if(pending){
          const img=document.createElement('img');
          img.alt=entry.title||'Original crochet pattern photograph';
          img.loading='lazy';
          img.src=thumbnail;
          pending.replaceWith(img);
        }
        // The full-size guide is NOT downloaded. Preserve the thumbnail
        // encrypted at rest so a return visit works immediately and offline.
        await storePreview(entry.id,thumbnail).catch(()=>{});
      }catch{/* A broken cover must never stop the rest of the library. */}
    }
  }

  async function openPattern(id){
    if(!authKey)return renderLogin();
    const entry=patterns.find(item=>item.id===id);
    if(!entry)return;
    const token=++loadingToken;
    activeId=id;activeStep=null;
    el.innerHTML='<section class="library-empty" role="status"><strong>Opening your pattern…</strong><span class="micro">Preparing your crochet guide ♡</span></section>';
    try{
      const guide=loadedPatterns.get(id)||await readAvailableGuide(entry);
      if(token!==loadingToken)return;
      loadedPatterns.set(id,guide);
      progress=loadProgress(id);
      renderGuide();
      void saveRealPhotoPreview(id,guide).catch(()=>{});
    }catch(error){
      if(token!==loadingToken)return;
      renderLibrary();
      toast('Could not open this guide. Check your connection or saved offline copy.');
    }
  }
  function closeModal(){modal.innerHTML='';document.body.style.overflow=''}
  // Give dialog controls their own click listeners. Do not rely on document-level
  // delegation, since overlays or earlier handlers can swallow those clicks.
  function bindModalControls(){
    modal.querySelectorAll('[data-action]').forEach(control=>{
      control.addEventListener('click',event=>{
        if(control.classList.contains('dialog-backdrop') && event.target!==control)return;
        event.preventDefault();
        event.stopPropagation();
        handleAction(control);
      });
    });
  }
  function showModal(body){
    modal.innerHTML=`<div class="dialog-backdrop" data-action="close-modal"><div class="dialog" role="dialog" aria-modal="true">${body}</div></div>`;
    document.body.style.overflow='hidden';
    bindModalControls();
  }
  function showDictionary(){const p=getPattern();let dict=p?.dictionary||{sc:'Single crochet (US terms)',inc:'Increase (2 sc in one stitch)',dec:'Decrease (2 stitches joined into 1)',slst:'Slip stitch',ch:'Chain',FO:'Fasten off',BLO:'Back loops only',FLO:'Front loops only',bo:'Bobble stitch',hdc:'Half double crochet',dc:'Double crochet',htr:'Half treble crochet'};showModal(`<div class="dialog-head"><div><span class="kicker">little helper</span><h2>Stitch dictionary ✿</h2></div><button class="x-btn" data-action="close-modal" aria-label="Close">×</button></div><p>Quick reminders for the abbreviations in this pattern (US terminology).</p><div class="dictionary">${Object.entries(dict).map(([k,v])=>`<div class="dict-item"><b>${esc(k)}</b> ${esc(v)}</div>`).join('')}</div><button class="btn btn-primary" data-action="close-modal">Back to crocheting ♡</button>`)}
  function showZoom(key){const p=getPattern(),src=picture(p,key);if(!src)return;modal.innerHTML=`<div class="dialog-backdrop zoom-backdrop" data-action="close-modal"><button class="x-btn" style="position:absolute;right:20px;top:20px" data-action="close-modal" aria-label="Close">×</button><img class="dialog-img" src="${src}" alt="Enlarged crochet reference photograph"></div>`;document.body.style.overflow='hidden';bindModalControls()}
  function resetConfirm(){const p=getPattern();if(!p)return;showModal(`<div class="dialog-head"><div><span class="kicker">fresh beginning?</span><h2>Restart ${esc(p.title)}?</h2></div><button type="button" class="x-btn" data-action="close-modal" aria-label="Close restart dialog">×</button></div><p>All completed-step checkmarks for this pattern will be cleared. This cannot be undone.</p><button type="button" class="btn btn-primary" data-action="confirm-reset">Yes, start again</button><button type="button" class="btn btn-secondary" data-action="close-modal">Keep my progress</button>`)}
  async function handleAction(button){const action=button.dataset.action;switch(action){case 'home':closeModal();renderLibrary();break;case 'open':openPattern(button.dataset.id);break;case 'step':renderGuide(button.dataset.id);break;case 'overview':renderOverview();break;case 'overview-top':if(overviewOpen)window.scrollTo({top:0,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});break;case 'back-to-guide':returnToGuide();break;case 'overview-section':{if(!overviewOpen)break;const section=document.getElementById('overview-group-'+button.dataset.id);section?.scrollIntoView({behavior:'smooth',block:'start'});break}case 'group':jumpGroup(button.dataset.id);break;case 'next':jump(1);break;case 'prev':jump(-1);break;case 'variant-option':{const chosen=button.dataset.value,p=getPattern();if(!p?.variants?.some(v=>v.id===chosen))break;progress.variantOption=chosen;persist();renderGuide('choose-style');toast('Pattern style saved ♡');break}case 'ear-option':{progress.earOption=button.dataset.value;persist();renderGuide(activeStep);toast('Your ear method is saved ♡');break}case 'toggle-done':progress.done[activeStep]=!progress.done[activeStep];persist();renderGuide(activeStep);break;case 'dictionary':showDictionary();break;case 'zoom':showZoom(button.dataset.key);break;case 'close-modal':closeModal();break;case 'reset':resetConfirm();break;case 'confirm-reset':progress=baseProgress();persist();activeStep=null;closeModal();renderGuide();toast('A fresh start ♡');break;}}
  document.addEventListener('click',e=>{const t=e.target.closest('[data-action]');if(!t)return; if(t.classList.contains('dialog-backdrop')&&e.target!==t)return; e.preventDefault();handleAction(t)});
  document.addEventListener('change',e=>{const m=e.target.closest('[data-material]');if(m){progress.materials[m.dataset.material]=m.checked;persist();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(modal.innerHTML){closeModal();return}if(overviewOpen){returnToGuide();return}closeModal();return}if(overviewOpen||!activeId||modal.innerHTML||['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();jump(1)}else if(e.key==='ArrowLeft'){e.preventDefault();jump(-1)}else if(e.key==='Enter' && document.activeElement?.dataset.action==='zoom'){showZoom(document.activeElement.dataset.key)}});
  $('#home-btn').addEventListener('click',()=>authKey?renderLibrary():renderLogin());
  async function init(){
    if(!window.isSecureContext || !window.crypto?.subtle){
      renderLogin('Please open Sunbeam Art over HTTPS in Safari or Chrome to sign in.');
      return;
    }
    try{
      const remembered=await savedAuthKey();
      if(remembered){
        try{
          await enterLibrary(remembered);
          return;
        }catch(error){
          await forgetAuthKey();
        }
      }
    }catch(error){/* IndexedDB can be disabled in private browsing. */}
    renderLogin();
  }
  init();
})();
