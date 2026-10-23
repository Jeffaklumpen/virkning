/* Sunbeam Art — Kimsi's crochet companion. Keep the existing local progress store unchanged. */
(() => {
  'use strict';
  const DB='kimsi-cozy-guides-v1';
  const STORE='guides';
  const $=(s)=>document.querySelector(s);
  const el=$('#app');
  const modal=$('#modal-root');
  let patterns=[], activeId=null, activeStep=null, activeGroup=null, progress={}, authKey=null;
  const {esc, icon, picture, validPattern, stepsFor, groupSteps, stats} = window.SunbeamPatterns;
  const {baseProgress, loadProgress, persistProgress, setGuideKey,
    getAllGuides, storeGuide, savedAuthKey, rememberAuthKey, forgetAuthKey} = window.SunbeamStorage;
  const {derivePasswordKey, unwrapPrivatePatternKey, decryptGuide} = window.SunbeamCrypto;
  const {estimateTime} = window.SunbeamEstimates;
  function persist() {
    progress.updatedAt = new Date().toISOString();
    persistProgress(activeId, progress);
  }
  function getPattern(){return patterns.find(p=>p.id===activeId)}
  function toast(message){document.querySelector('.toast')?.remove();const n=document.createElement('div');n.className='toast';n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),2900)}
  function dataThumb(p){const src=picture(p,p.cover||'cover');return src?`<img src="${src}" alt="${esc(p.title)}" loading="lazy">`:`<span class="pattern-thumb-placeholder">🧶</span>`}

  // One password unlocks bundled ciphertexts; login can be remembered on-device.
  function renderLogin(message=''){
    activeId=null;activeStep=null;
    el.innerHTML=`<section class="sunbeam-login" aria-label="Private login">
      <div class="sunbeam-login-card">
        <div class="login-bee-halo" aria-hidden="true"><img src="assets/sunbeam-bee.svg" alt="" class="login-bee-image" /></div>
        <span class="kicker">a little hive of handmade magic</span>
        <h1>Welcome to <em>Sunbeam Art!</em></h1>
        <p class="login-subtitle">A cozy creative corner, just for Kimsi. Enter your password to see your patterns and pick up right where you left off.</p>
        <form id="sunbeam-login-form" autocomplete="on">
          <label for="sunbeam-password">Your password</label>
          <input type="password" id="sunbeam-password" name="password" autocomplete="current-password" required placeholder="Enter password" />
          <p id="sunbeam-login-error" class="login-error" role="alert" aria-live="polite">${esc(message)}</p>
          <button type="submit" id="sunbeam-login-submit" class="btn btn-primary">Open my little hive <span aria-hidden="true">➜</span></button>
        </form>
        <p class="login-remember-note">♡ Stay signed in on this device — no need to enter your password every time.</p>
      </div>
    </section>`;
    el.querySelector('#sunbeam-login-form')?.addEventListener('submit',event=>{
      event.preventDefault();
      signInWithPassword();
    });
  }
  async function loadPrivatePatterns(patternKey,loginKey){
    const entries=Array.isArray(window.SUNBEAM_ENCRYPTED_GUIDES)?window.SUNBEAM_ENCRYPTED_GUIDES:[];
    const already=await getAllGuides();
    for(const item of entries){
      const installed=already.find(g=>g.id===item.id);
      // Upgrade an existing guide when its encrypted source is revised.
      // Completion, current round, and materials are saved separately by pattern ID.
      if(installed && Number(installed.revision||1)>=Number(item.revision||1))continue;
      const guide = await decryptGuide(item, patternKey, loginKey);
      if(!validPattern(guide)||guide.id!==item.id)throw Error('Invalid private pattern file');
      await storeGuide({...guide,revision:Math.max(Number(guide.revision||1),Number(item.revision||1))});
    }
  }
  async function enterLibrary(loginKey){
    const patternKey=await unwrapPrivatePatternKey(loginKey);
    setGuideKey(patternKey);
    await loadPrivatePatterns(patternKey,loginKey);
    // Existing local guides and progress are preserved: neither database is cleared.
    patterns=await getAllGuides();
    authKey=loginKey;
    renderLibrary();
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

  function renderLibrary(){if(!authKey)return renderLogin();activeId=null;activeStep=null;const started=patterns.length?patterns.map(p=>{const pr=loadProgress(p.id);return {p,pr,n:stats(p,pr),time:estimateTime(p,pr)}}).sort((a,b)=>(b.pr.updatedAt||'').localeCompare(a.pr.updatedAt||'')):[];
    el.innerHTML=`<section class="hero"><div class="hero-content"><span class="kicker">a cozy little hive of creativity</span><h1>Hey there, <em>Kimsi!</em> <span class="hero-sun" aria-hidden="true">☀</span></h1><p class="lead">Welcome to your sunny little crochet studio. Tiny handmade friends, lovely patterns and every stitch saved right where you left off.</p><div class="hero-actions">${started.length?`<button class="btn btn-primary" data-action="open" data-id="${esc(started[0].p.id)}">${icon('heart')} Continue crocheting</button>`:'' }</div></div><div class="hero-art" aria-hidden="true"><span class="floating-star"></span><div class="illustration"><img class="hero-bee" src="assets/sunbeam-bee.svg" alt="" /></div><span class="bee-flight-dots" aria-hidden="true"></span><span class="floating-heart">♡</span></div></section><div class="section-heading"><div><h2>Your Pattern Hive <span class="sunbeam-section-flower" aria-hidden="true">✿</span></h2><p>Find your next project or continue where you left off.</p></div><span class="count-pill">${patterns.length} pattern${patterns.length===1?'':'s'}</span></div><section class="pattern-grid">${started.map(({p,n,time})=>`<button class="pattern-card" data-action="open" data-id="${esc(p.id)}"><div class="pattern-thumb">${dataThumb(p)}${n.percent===100?'<span class="pattern-complete-badge">✓ Finished</span>':''}</div><div class="pattern-body"><span class="badge">♡ ${esc(p.difficulty||'Crochet')}</span><h3>${esc(p.title)}</h3><div class="micro">${esc(p.designer||'My pattern')} · ${esc(p.category||'Amigurumi')}</div>${time?`<div class="pattern-time" aria-label="Estimated making time: ${esc(time)}">${icon('clock')}<span><strong>Estimated time:</strong> ${esc(time)}</span></div>`:''}<div class="pattern-progress"><div class="progress-track"><div class="progress-fill" style="width:${n.percent}%"></div></div></div><div class="pattern-foot"><span class="micro">${n.percent===100?'Yay! All finished ✨':`${n.percent}% complete`}</span><span style="color:#c5849a">${icon('chevron')}</span></div></div></button>`).join('')}${patterns.length ? '' : '<div class="library-empty"><span class="flower">✿</span><strong>A little magic is on its way!</strong><span class="micro">Your crochet patterns will bloom here soon.</span></div>'}</section><p class="small-note" style="margin:23px 4px">✦ Your crochet progress is saved automatically in this browser. It does not sync between devices.</p>`;
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderGuide(stepId){const p=getPattern();if(!p)return renderLibrary();const all=stepsFor(p,progress);if(!all.length)return renderLibrary();if(stepId && all.some(s=>s.id===stepId))activeStep=stepId;else if(!activeStep||!all.some(s=>s.id===activeStep))activeStep=progress.lastStep&&all.some(s=>s.id===progress.lastStep)?progress.lastStep:all[0].id;
    const step=all.find(s=>s.id===activeStep);activeGroup=step.groupId;progress.lastStep=activeStep;persist();const st=stats(p,progress);const idx=all.findIndex(s=>s.id===step.id);const cover=picture(p,p.cover||'cover');
    el.innerHTML=`<button class="back-link" data-action="home">${icon('left')} Back to patterns</button><header class="guide-hero"><img class="guide-cover" src="${cover||'favicon.svg'}" alt="${esc(p.title)}"><div><div class="guide-tags"><span class="badge">${esc(p.category||'Amigurumi')}</span><span class="badge badge-lav">${esc(p.difficulty||'Cozy project')}</span></div><h1>${esc(p.title)}</h1><p>Designed by ${esc(p.designer||'Unknown')} · ${esc(p.size||'')}</p>${estimateTime(p,progress)?`<div class="guide-time"><div class="guide-time-main">${icon('clock')}<span><strong>Estimated time:</strong> ${esc(estimateTime(p,progress))}</span></div><span class="estimate-note">Includes crocheting, stuffing and finishing. Actual time varies by experience and pace.</span></div>`:''}</div><div class="guide-hero-right"><div class="progress-circle" style="--progress:${st.percent}"><strong>${st.percent}%</strong></div><div class="micro">${st.complete} / ${st.total} steps done</div></div></header>
    <div class="guide-layout"><nav class="sidebar"><div class="sidebar-header"><strong>Sections</strong></div>${p.groups.filter(g=>groupSteps(p,g,progress).length).map((g,i)=>{const ss=groupSteps(p,g,progress),completed=ss.filter(s=>progress.done[s.id]).length;const activated=g.id===activeGroup;return `<div class="sidebar-group"><button class="${activated?'active':''} ${completed===ss.length&&ss.length?'done':''}" data-action="group" data-id="${esc(g.id)}"><span class="num">${completed===ss.length&&ss.length?icon('check'):String(i+1).padStart(2,'0')}</span><span>${esc(g.title)}</span><small class="sidebar-tiny">${completed}/${ss.length}</small></button></div>`}).join('')}<div class="side-footer"><button data-action="dictionary">✦ Stitch dictionary</button></div></nav><article class="main-workspace"><div class="chapter-nav"><select id="chapter-select" aria-label="Choose section">${p.groups.filter(g=>groupSteps(p,g,progress).length).map(g=>`<option value="${esc(g.id)}" ${g.id===activeGroup?'selected':''}>${esc(g.title)} (${groupSteps(p,g,progress).filter(s=>progress.done[s.id]).length}/${groupSteps(p,g,progress).length} done)</option>`).join('')}</select><button type="button" class="mobile-dictionary-btn" data-action="dictionary">✦ Stitch dictionary</button></div><div class="panel step-panel ${progress.done[step.id]?'step-panel-complete':''}"><div class="section-label">${esc(step.groupTitle)} · Step ${idx+1} of ${all.length}</div><div class="step-completion ${progress.done[step.id]?'completed':'in-progress'}" role="status"><span class="step-completion-icon">${progress.done[step.id]?'✓':'○'}</span><span><strong>${progress.done[step.id]?'Step completed!':'Ready when you are'}</strong><small>${progress.done[step.id]?'You’ve already finished this step. Progress is saved ♡':'Mark this step as done once you’ve finished it.'}</small></span></div><div class="step-counter"><div class="muted micro">${progress.done[step.id]?'✓ Completed and saved':'Slow and steady, little bee ♡'}</div>${step.count!==undefined&&step.count!==null?`<div class="stitch-count">✳ ${esc(step.count)} stitches</div>`:''}</div><h2 class="step-title">${esc(step.title)}</h2>${step.raw?`<div class="stitch-raw">${esc(step.raw)}</div>`:''}<div class="step-instruction">${esc(step.instruction)}</div>${step.image&&picture(p,step.image)?`<img class="step-image" src="${picture(p,step.image)}" alt="${esc(step.title)} reference photo" data-action="zoom" data-key="${esc(step.image)}" tabindex="0"><p class="image-caption">✦ Reference photo from your personal pattern · tap to enlarge</p>`:''}${step.tip?`<div class="tip-box"><div class="tip-icon">💡</div><div><strong>A sunny little tip</strong><p>${esc(step.tip)}</p></div></div>`:''}${step.warning?`<div class="tip-box lav"><div class="tip-icon">✿</div><div><strong>Remember this</strong><p>${esc(step.warning)}</p></div></div>`:''}${step.id==='prep-materials'?renderMaterials(p):''}${step.id==='ear-choice'?renderChoices():''}${step.id==='choose-style'&&p.variants?.length?renderVariantChoices(p):''}${step.images?.length?`<div class="gallery-row">${step.images.filter(key=>picture(p,key)).map(key=>`<img src="${picture(p,key)}" data-action="zoom" data-key="${esc(key)}" alt="Reference image for ${esc(step.title)}" loading="lazy">`).join('')}</div>`:''}<div class="step-actions"><button class="btn btn-secondary" ${idx===0?'disabled':''} data-action="prev">${icon('left')} Previous</button><button class="btn ${progress.done[step.id]?'btn-mint':'btn-primary'}" data-action="next">${progress.done[step.id]?'Next step':idx===all.length-1?'✓ Finish project':'✓ Mark done & next'} ${icon('arrow')}</button></div><div class="step-counter" style="margin:28px 0 3px"><strong style="font-size:13px">Jump to a step</strong><button class="danger-btn" data-action="toggle-done">${progress.done[step.id]?'↶ Undo completion':'✓ Mark as done'}</button></div><div class="round-markers">${all.filter(x=>x.groupId===activeGroup).map(x=>`<button class="round-marker ${x.id===activeStep?'active':''} ${progress.done[x.id]?'done':''}" data-action="step" data-id="${esc(x.id)}" title="${esc(x.title)}" aria-label="Go to ${esc(x.title)}${progress.done[x.id]?', completed':''}">${progress.done[x.id]?'✓':esc(String(x.short||x.title).slice(0,3))}</button>`).join('')}</div></div><div class="utility-row"><button data-action="reset">${icon('reset')} Restart this pattern</button></div></article></div>`;
    document.getElementById('chapter-select')?.addEventListener('change',(e)=>jumpGroup(e.target.value));
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderMaterials(p){return `<div class="mat-grid">${(p.materials||[]).map((m,i)=>`<label class="mat-item"><input type="checkbox" class="mat-check" data-material="${i}" ${progress.materials[i]?'checked':''}><span>${esc(m.name)}<small>${esc(m.detail||'')}</small></span></label>`).join('')}</div>`}
  function renderVariantChoices(pattern){
    const options=Array.isArray(pattern.variants)?pattern.variants:[];
    const selected=progress.variantOption||options[0]?.id;
    return `<div class="choice-list" role="group" aria-label="Pattern variation">${options.map(v=>`<button type="button" class="choice ${selected===v.id?'selected':''}" data-action="variant-option" data-value="${esc(v.id)}" aria-pressed="${selected===v.id}"><span class="choice-indicator">${selected===v.id?icon('check'):''}</span><strong>${esc(v.title)}</strong><small>${esc(v.description||'')}</small></button>`).join('')}</div><p class="small-note">Only your selected cat style's steps are shown. Each variation keeps its own saved progress ♡</p>`;
  }
  function renderChoices(){return `<div class="choice-list"><button class="choice ${progress.earOption==='1'?'selected':''}" data-action="ear-option" data-value="1"><span class="choice-indicator">${progress.earOption==='1'?icon('check'):''}</span><strong>Option 1 · In the round</strong><small>Work both ears during R8 using front loops. More stitch markers; ears are attached as you go.</small></button><button class="choice ${progress.earOption==='2'?'selected':''}" data-action="ear-option" data-value="2"><span class="choice-indicator">${progress.earOption==='2'?icon('check'):''}</span><strong>Option 2 · After finishing</strong><small>Make the ears later on the stitch posts. Fewer markers and adjustable placement.</small></button></div><p class="small-note" style="margin-top:13px">Only steps for your chosen method will appear. You can switch anytime.</p>`}
  function jumpGroup(id){const p=getPattern(),group=p?.groups.find(x=>x.id===id);if(!group)return;const step=groupSteps(p,group,progress)[0];if(step)renderGuide(step.id)}
  function jump(delta){const p=getPattern(),all=stepsFor(p,progress),i=all.findIndex(x=>x.id===activeStep);if(i<0)return; if(delta>0){progress.done[activeStep]=true;persist();}const next=all[Math.max(0,Math.min(all.length-1,i+delta))];if(delta>0&&i===all.length-1)return showFinished();renderGuide(next.id)}
  function showFinished(){const p=getPattern(),st=stats(p,progress);const src=picture(p,p.cover||'cover');el.innerHTML=`<button class="back-link" data-action="home">${icon('left')} Back to patterns</button><div class="panel finish-hero"><div class="emoji">🎉 🧶 ✨</div><span class="kicker">you did it!</span><h1 style="font-size:45px">So proud of you, <em style="color:#d787a0">Kimsi!</em></h1>${src?`<img src="${src}" alt="Finished project" style="width:min(270px,100%);height:240px;object-fit:cover;border-radius:24px;margin:5px auto 22px;display:block">`:''}<h2>${esc(p.title)}</h2><p>Another handmade friend, stitched with love and a little sunshine. Your progress is safely saved in this browser.</p><div class="hero-actions" style="justify-content:center"><button class="btn btn-primary" data-action="home">${icon('heart')} Back to patterns</button></div><p class="micro" style="margin-top:20px">${st.complete}/${st.total} steps completed</p></div>`;window.scrollTo(0,0)}
  function openPattern(id){if(!authKey)return renderLogin();const p=patterns.find(x=>x.id===id);if(!p)return;activeId=id;progress=loadProgress(id);activeStep=null;renderGuide()}
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
  async function handleAction(button){const action=button.dataset.action;switch(action){case 'home':closeModal();renderLibrary();break;case 'open':openPattern(button.dataset.id);break;case 'step':renderGuide(button.dataset.id);break;case 'group':jumpGroup(button.dataset.id);break;case 'next':jump(1);break;case 'prev':jump(-1);break;case 'variant-option':{const chosen=button.dataset.value,p=getPattern();if(!p?.variants?.some(v=>v.id===chosen))break;progress.variantOption=chosen;persist();renderGuide('choose-style');toast('Pattern style saved ♡');break}case 'ear-option':{progress.earOption=button.dataset.value;persist();renderGuide(activeStep);toast('Your ear method is saved ♡');break}case 'toggle-done':progress.done[activeStep]=!progress.done[activeStep];persist();renderGuide(activeStep);break;case 'dictionary':showDictionary();break;case 'zoom':showZoom(button.dataset.key);break;case 'close-modal':closeModal();break;case 'reset':resetConfirm();break;case 'confirm-reset':progress=baseProgress();persist();activeStep=null;closeModal();renderGuide();toast('A fresh start ♡');break;}}
  document.addEventListener('click',e=>{const t=e.target.closest('[data-action]');if(!t)return; if(t.classList.contains('dialog-backdrop')&&e.target!==t)return; e.preventDefault();handleAction(t)});
  document.addEventListener('change',e=>{const m=e.target.closest('[data-material]');if(m){progress.materials[m.dataset.material]=m.checked;persist();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();return}if(!activeId||modal.innerHTML||['TEXTAREA','INPUT','SELECT'].includes(document.activeElement?.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();jump(1)}else if(e.key==='ArrowLeft'){e.preventDefault();jump(-1)}else if(e.key==='Enter' && document.activeElement?.dataset.action==='zoom'){showZoom(document.activeElement.dataset.key)}});
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
