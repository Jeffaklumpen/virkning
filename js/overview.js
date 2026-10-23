/* Complete, scrollable pattern overview; source data stays encrypted until unlocked. */
(function OverviewModule() {
  'use strict';
  const {esc,icon,picture,groupSteps,stepsFor,stats} = window.SunbeamPatterns;
  const {estimateTime} = window.SunbeamEstimates;

  function stepPhotos(p,step) {
    const keys=[step.image,...(Array.isArray(step.images)?step.images:[])];
    const unique=[...new Set(keys.filter(key=>typeof key==='string'&&key.length))];
    return unique.filter(key=>picture(p,key)).map((key,i)=>
      `<button type="button" class="overview-photo" data-action="zoom" data-key="${esc(key)}" aria-label="Enlarge ${esc(step.title)} reference photo ${i+1}">
        <img src="${picture(p,key)}" alt="${esc(step.title)} reference photo ${i+1}" loading="lazy" decoding="async">
        <span class="overview-photo-zoom" aria-hidden="true">${icon('zoom')}</span>
      </button>`).join('');
  }
  function specialDetails(p,step,progress) {
    if(step.id==='prep-materials'&&Array.isArray(p.materials)&&p.materials.length)
      return `<div class="overview-materials"><strong>Materials</strong><div>${p.materials.map((m,i)=>
        `<span class="overview-material">${progress.materials?.[i]?'✓ ':''}${esc(m.name)}${m.detail?` <small>${esc(m.detail)}</small>`:''}</span>`).join('')}</div></div>`;
    if(step.id==='choose-style'&&Array.isArray(p.variants))
      return `<div class="overview-choices"><strong>Available styles</strong><div>${p.variants.map(v=>
        `<span class="overview-choice ${v.id===(progress.variantOption||'solid')?'is-selected':''}">${esc(v.title)}${v.id===(progress.variantOption||'solid')?' ✓':''}</span>`).join('')}</div></div>`;
    if(step.id==='ear-choice')
      return `<p class="overview-selection-note">Current ear method: <strong>Option ${esc(progress.earOption||'2')}</strong>. Change it in step view to update your overview.</p>`;
    return '';
  }
  function card(p,step,progress,number,currentStepId) {
    const completed=!!progress.done?.[step.id];
    const media=stepPhotos(p,step);
    return `<article class="overview-step ${completed?'is-complete':''} ${step.id===currentStepId?'is-current':''}">
      <div class="overview-step-heading">
        <span class="overview-step-number" aria-hidden="true">${String(number).padStart(2,'0')}</span>
        <div class="overview-step-heading-text">
          <div class="overview-step-topline"><span>Step ${number}</span>${step.count!=null?`<span>${esc(step.count)} stitches</span>`:''}</div>
          <h3>${esc(step.title)}</h3>
        </div>
        <span class="overview-step-status ${completed?'is-done':''}">${completed?'✓ Done':step.id===currentStepId?'Current':'To do'}</span>
      </div>
      <div class="overview-step-content ${media?'has-photos':''}">
        <div class="overview-step-copy">
          ${step.raw?`<div class="overview-stitch">${esc(step.raw)}</div>`:''}
          ${step.instruction?`<p class="overview-instruction">${esc(step.instruction)}</p>`:''}
          ${specialDetails(p,step,progress)}
          ${step.tip?`<p class="overview-step-tip"><strong>Tip</strong> ${esc(step.tip)}</p>`:''}
          ${step.warning?`<p class="overview-step-tip overview-step-warning"><strong>Remember</strong> ${esc(step.warning)}</p>`:''}
        </div>
        ${media?`<div class="overview-photo-grid">${media}</div>`:''}
      </div>
      <div class="overview-step-footer"><button type="button" data-action="step" data-id="${esc(step.id)}" class="overview-open-step">Open this step ${icon('arrow')}</button></div>
    </article>`;
  }
  function render(p,progress,currentStepId) {
    const groups=(p.groups||[]).map(group=>({group,steps:groupSteps(p,group,progress)})).filter(x=>x.steps.length);
    const all=stepsFor(p,progress);
    const progressStats=stats(p,progress);
    const time=estimateTime(p,progress);
    const cover=window.SunbeamPreviews.source(p);
    const selectedStyle=Array.isArray(p.variants)?p.variants.find(v=>v.id===(progress.variantOption||'solid')):null;
    const hasEarChoice=(p.groups||[]).some(g=>(g.steps||[]).some(s=>s.option));
    let stepNumber=0;
    return `<div class="pattern-overview">
      <div class="overview-topbar">
        <button class="back-link overview-back" type="button" data-action="back-to-guide">${icon('left')} Back to guide</button>
        <span class="overview-readonly">READ-ONLY OVERVIEW</span>
      </div>
      <header class="overview-hero">
        <div class="overview-intro">
          <span class="overview-eyebrow">✦ YOUR PATTERN, AT A GLANCE</span>
          <h1>Pattern overview</h1>
          <p class="overview-subtitle">${esc(p.title)}</p>
          <p class="overview-description">Every section and step together on one page. Scroll to explore, or jump straight to where you want to crochet.</p>
          <div class="overview-tags">
            ${selectedStyle?`<span>Style: ${esc(selectedStyle.title)}</span>`:''}
            ${hasEarChoice?`<span>Ears: Option ${esc(progress.earOption||'2')}</span>`:''}
            ${time?`<span>${icon('clock')} ${esc(time)}</span>`:''}
          </div>
        </div>
        ${cover?`<img class="overview-cover" src="${cover}" alt="${esc(p.title)} finished crochet project" decoding="async">`:''}
      </header>
      <div class="overview-stats" aria-label="Pattern summary">
        <div class="overview-stat"><strong>${groups.length}</strong><span>Sections</span></div>
        <div class="overview-stat"><strong>${all.length}</strong><span>Steps</span></div>
        <div class="overview-stat"><strong>${progressStats.complete}/${progressStats.total}</strong><span>Completed</span></div>
        <div class="overview-stat"><strong>${progressStats.percent}%</strong><span>Progress</span></div>
      </div>
      <nav class="overview-toc" aria-label="Jump to a pattern section">
        <span class="overview-toc-title">Jump to</span>
        <div class="overview-toc-links">${groups.map(({group,steps},i)=>
          `<button type="button" data-action="overview-section" data-id="${esc(group.id)}" class="overview-toc-link"><span>${String(i+1).padStart(2,'0')}</span>${esc(group.title)} <small>${steps.length}</small></button>`).join('')}
        </div>
      </nav>
      <div class="overview-sections" aria-label="All selected crochet pattern steps">
        ${groups.map(({group,steps},i)=>`<section class="overview-section" id="overview-group-${esc(group.id)}" aria-label="${esc(group.title)}">
          <div class="overview-section-heading">
            <span class="overview-section-index">${String(i+1).padStart(2,'0')}</span>
            <div><span class="overview-section-kicker">SECTION ${i+1} OF ${groups.length}</span><h2>${esc(group.title)}</h2></div>
            <span class="overview-section-count">${steps.filter(s=>progress.done?.[s.id]).length}/${steps.length} done</span>
          </div>
          <div class="overview-step-list">${steps.map(step=>card(p,step,progress,++stepNumber,currentStepId)).join('')}</div>
        </section>`).join('')}
      </div>
      <button type="button" class="overview-to-top" data-action="overview-top" aria-label="Scroll to the top of the pattern overview" hidden>
        <span class="overview-to-top-icon" aria-hidden="true">${icon('left')}</span>
        <span>Back to top</span>
      </button>
      <div class="overview-end"><span aria-hidden="true">✳</span><strong>End of pattern</strong>
        <p>Ready to get back to crocheting?</p>
        <button class="btn btn-primary" type="button" data-action="back-to-guide">${icon('left')} Back to guide</button>
      </div>
    </div>`;
  }
  window.SunbeamOverview=Object.freeze({render});
})();
