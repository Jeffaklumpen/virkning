/* PDF → editable Sunbeam guide. PDF bytes are parsed ONLY in browser memory.
   No API, upload, cache, IndexedDB or storage call receives an original PDF. */
(() => {
  'use strict';
  const {esc}=window.SunbeamPatterns;
  const PHOTOS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let loader=null,root=null,draft=null,callbacks=null,busy=false,bindRoot=null;
  // The PDF.js document stays ONLY in memory while this import is being edited.
  // It is disposed on save/cancel, never persisted or uploaded.
  let pdfDocument=null,highQualityPages=new Map(),previewOverlay=null;
  let previewIndex=0,previewGeneration=0,previewReturnFocus=null,previewKeyListener=null;
  const random=()=>crypto.randomUUID().replace(/-/g,'').slice(0,16);
  const id=prefix=>prefix+'-'+random();
  const text=value=>String(value||'');
  function loadPdf(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(loader)return loader;
    loader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=PHOTOS+'pdf.min.js';script.crossOrigin='anonymous';
      script.onload=()=>{
        if(!window.pdfjsLib)return reject(Error('PDF reader could not start.'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=PHOTOS+'pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror=()=>reject(Error('Could not load the PDF reader. Check your connection.'));
      document.head.appendChild(script);
    }).catch(e=>{loader=null;throw e});
    return loader;
  }
  const clean=s=>text(s).replace(/\s+/g,' ').trim();
  // Structure based on PDF coordinates and common crochet headings. Designed
  // as a FIRST DRAFT, not a promise of correct instructions or page ordering.
  function linesFromText(items){
    const entries=items.filter(i=>clean(i.str)).map(i=>({
      x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0),s:clean(i.str)
    })).sort((a,b)=>b.y-a.y||a.x-b.x);
    const rows=[];
    for(const word of entries){
      let row=rows.find(r=>Math.abs(r.y-word.y)<3.2);
      if(!row){row={y:word.y,parts:[]};rows.push(row)}
      row.parts.push(word);
    }
    return rows.sort((a,b)=>b.y-a.y).map(r=>r.parts
      .sort((a,b)=>a.x-b.x).map(p=>p.s).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  }
  const round=/^(?:(?:round|rnd|row|rd)\s*#?\s*\d+(?:\s*[-–]\s*\d+)?|r\s*\d+(?:\s*[-–]\s*\d+)?|\d+\s*[-–]\s*\d+)\s*[:.)–-]?\s*/i;
  const heading=/^(?:materials?|supplies|yarn|abbreviations|notes?|instructions?|assembly|finishing|body|head|ears?|arms?|legs?|tail|wings?|eyes?|flowers?|petals?|pattern|part\s+\d+|pieces?|appendix|introduction)\s*:?\s*$/i;
  function parsePages(pages,filename){
    const groups=[];let group=null,last=null;
    const newGroup=title=>{
      const named=clean(title).slice(0,90)||'Instructions';
      group={id:id('section'),title:named,steps:[]};groups.push(group);last=null;
    };
    newGroup('Getting started');
    for(const p of pages){
      let firstOnPage=null,blank=true;
      for(const line of p.lines){
        if(!line||/^\d{1,3}$/.test(line))continue;
        blank=false;
        if(heading.test(line)||(/^[A-Z][A-Z\s/&-]{5,52}$/.test(line)&&!/\d/.test(line))){
          newGroup(line.charAt(0).toUpperCase()+line.slice(1).toLowerCase());continue;
        }
        const r=round.exec(line);
        if(r){
          const title=clean(r[0]).replace(/[:.)–-]\s*$/,'')||'Round';
          last={id:id('step'),title,instruction:clean(line.slice(r[0].length))||line,image:''};
          group.steps.push(last);if(!firstOnPage)firstOnPage=last;
        }else if(last&&last.instruction.length<2200){
          last.instruction+=' '+line;
        }else{
          last={id:id('step'),title:line.length<70?line:'Instruction',instruction:line,image:''};
          group.steps.push(last);if(!firstOnPage)firstOnPage=last;
        }
      }
      if(blank||!firstOnPage){
        newGroup('Reference page '+p.number);
        last={id:id('step'),title:'Review page '+p.number,
          instruction:'Review the original page image below. This page may contain scanned text that cannot be read automatically.',
          image:'page-'+p.number};
        group.steps.push(last);
      }else firstOnPage.image='page-'+p.number;
    }
    const usable=groups.filter(g=>g.steps.length);
    if(!usable.length)usable.push({id:id('section'),title:'Instructions',steps:[{
      id:id('step'),title:'Review your PDF',instruction:'Review and add the steps from your PDF.',image:''
    }]});
    return {id:null,title:filename.replace(/\.pdf$/i,'').replace(/[_-]/g,' ').slice(0,150)||'My pattern',
      designer:'My patterns',category:'Amigurumi',difficulty:'Crochet',size:'',
      groups:usable,cover:'page-1',images:Object.fromEntries(pages.map(p=>['page-'+p.number,p.image])),
      imagePaths:{},existingImages:{},custom:true};
  }
  async function readPdf(file,onProgress){
    if(!file||!(file.type==='application/pdf'||/\.pdf$/i.test(file.name)))
      throw Error('Please choose a PDF file.');
    if(file.size>20*1024*1024)throw Error('This PDF is over 20 MB. Please choose a smaller file.');
    if(pdfDocument){const previous=pdfDocument;pdfDocument=null;highQualityPages.clear();await previous.destroy().catch(()=>{})}
    const lib=await loadPdf();
    // The only read of the original file. The ArrayBuffer is NOT persisted.
    let raw=await file.arrayBuffer();
    const job=lib.getDocument({data:new Uint8Array(raw),useSystemFonts:true,isEvalSupported:false});
    raw=null;let doc=null;
    try{
      doc=await job.promise;
      if(doc.numPages>35)throw Error('This PDF has more than 35 pages. Split it into smaller parts before importing.');
      const pages=[];
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        onProgress('Reading page '+pageNo+' of '+doc.numPages+'…');
        const page=await doc.getPage(pageNo);
        const content=await page.getTextContent();
        const lines=linesFromText(content.items||[]);
        const base=page.getViewport({scale:1});
        const scale=Math.min(1.8,960/Math.max(base.width,1));
        const viewport=page.getViewport({scale});
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(viewport.width));
        canvas.height=Math.max(1,Math.round(viewport.height));
        const context=canvas.getContext('2d',{alpha:false});
        context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
        await page.render({canvasContext:context,viewport}).promise;
        const image=canvas.toDataURL('image/webp',.73);
        canvas.width=canvas.height=0;
        pages.push({number:pageNo,lines,image});
        page.cleanup();
      }
      const parsed=parsePages(pages,file.name);
      // Keep vector-quality PDF pages available for on-demand zoom/crop, without saving the file.
      pdfDocument=doc;
      doc=null;
      return parsed;
    }finally{
      if(doc)await doc.destroy().catch(()=>{});
      else if(!pdfDocument)await job.destroy().catch(()=>{});
    }
  }
  function pageShell(content){
    return '<section class="import-page"><div class="import-nav"><button type="button" class="back-link" data-import-action="cancel">← Back to patterns</button>'+
      '<span class="import-private">♧ Private PDF import</span></div>'+content+'</section>';
  }
  function uploadScreen(message=''){
    return pageShell('<div class="import-welcome"><span class="kicker">Your Pattern Hive</span>'+
      '<h1>Turn a PDF into a <em>crochet guide</em> ♡</h1>'+
      '<p>Choose your own pattern. Sunbeam will try to organize the rounds, sections and page images into a guide you can edit before saving.</p>'+
      '<label class="import-drop" for="sunbeam-pdf-input"><span class="import-upload-icon">⇧</span>'+
      '<strong>Choose your PDF pattern</strong><small>PDF only · 20 MB maximum · up to 35 pages</small>'+
      '<input type="file" accept=".pdf,application/pdf" id="sunbeam-pdf-input" /></label>'+
      '<p class="import-privacy">🔒 Your original PDF stays in your browser and is never uploaded or saved. Only your finished guide and chosen images are stored.</p>'+
      '<p class="import-warning">Automatic recognition is not perfect. Always check stitch counts, round order and image placement before saving.</p>'+
      '<p role="status" class="import-status">'+esc(message)+'</p></div>');
  }
  function selectImage(key){
    return '<select data-field="image" aria-label="Image for step">'+
      '<option value="">No image</option>'+
      Object.keys(draft.images||{}).map(k=>'<option value="'+esc(k)+'" '+(k===key?'selected':'')+'>'+esc(k.replace(/^page-/,'PDF page ').replace(/^crop-/,'Crop '))+'</option>').join('')+'</select>';
  }
  function groupOptions(current){
    return draft.groups.map(g=>'<option value="'+esc(g.id)+'" '+(g.id===current?'selected':'')+'>'+esc(g.title)+'</option>').join('');
  }
  function editor(){
    const groupMarkup=draft.groups.map((g,gi)=>'<section class="import-group" data-group="'+esc(g.id)+'">'+
      '<div class="import-group-header"><span class="import-group-index">'+(gi+1)+'</span>'+
      '<input class="import-group-title" aria-label="Section title" data-field="group-title" data-group="'+esc(g.id)+'" value="'+esc(g.title)+'" maxlength="150" />'+
      '<div class="import-compact-actions"><button title="Move section up" data-import-action="group-up" data-group="'+esc(g.id)+'" '+(gi===0?'disabled':'')+'>↑</button>'+
      '<button title="Move section down" data-import-action="group-down" data-group="'+esc(g.id)+'" '+(gi===draft.groups.length-1?'disabled':'')+'>↓</button>'+
      '<button title="Delete section" data-import-action="group-delete" data-group="'+esc(g.id)+'">×</button></div></div>'+
      '<div class="import-step-list">'+g.steps.map((step,si)=>'<article class="import-step" data-step="'+esc(step.id)+'" data-group="'+esc(g.id)+'">'+
      '<div class="import-step-top"><span class="import-step-number">Step '+(si+1)+'</span>'+
      '<div class="import-compact-actions"><button title="Move step up" data-import-action="step-up" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'" '+(si===0?'disabled':'')+'>↑</button>'+
      '<button title="Move step down" data-import-action="step-down" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'" '+(si===g.steps.length-1?'disabled':'')+'>↓</button>'+
      '<button title="Remove step" data-import-action="step-delete" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'">×</button></div></div>'+
      '<label class="import-label">Step title<input data-field="step-title" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'" value="'+esc(step.title)+'" maxlength="160" /></label>'+
      '<label class="import-label">Instructions<textarea rows="3" data-field="instruction" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'" maxlength="10000">'+esc(step.instruction)+'</textarea></label>'+
      '<div class="import-step-image-row">'+(step.image&&draft.images?.[step.image]?'<button type="button" class="import-image-preview-trigger import-step-preview" data-import-action="preview" data-image-key="'+esc(step.image)+'" title="Enlarge reference image" aria-label="Enlarge '+esc(step.image.replace(/^page-/,'PDF page '))+'"><img alt="Selected PDF reference – tap to enlarge" src="'+draft.images[step.image]+'" /><span>⌕ View larger</span></button>':'<div class="import-no-image">No image</div>')+
      '<div class="import-step-image-tools"><label>Reference image'+selectImage(step.image)+'</label>'+
      '<label>Move into section<select data-field="move-section" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'">'+groupOptions(g.id)+'</select></label>'+
      (step.image&&draft.images?.[step.image]?'<button class="btn btn-soft" type="button" data-import-action="crop" data-group="'+esc(g.id)+'" data-step="'+esc(step.id)+'">✂ Crop image</button>':'')+
      '</div></div></article>').join('')+'</div>'+
      '<button class="import-add-step" data-import-action="add-step" data-group="'+esc(g.id)+'">+ Add step</button></section>').join('');
    const numSteps=draft.groups.reduce((n,g)=>n+g.steps.length,0);
    return pageShell('<header class="import-editor-header"><div><span class="kicker">Make it your own</span>'+
      '<h1>Review your <em>pattern guide</em></h1><p>Everything uses the same step-by-step Sunbeam design. Move sections or rounds, adjust wording and place the original images where they belong.</p></div>'+
      '<div class="import-counter"><strong>'+numSteps+'</strong><small>steps · '+draft.groups.length+' sections</small></div></header>'+
      '<div class="import-two-col"><aside class="import-guide-details"><div class="import-details-card">'+
      '<h2>Pattern details</h2>'+
      '<label class="import-label">Pattern name<input data-field="title" maxlength="160" value="'+esc(draft.title)+'" /></label>'+
      '<label class="import-label">Designer<input data-field="designer" maxlength="120" value="'+esc(draft.designer)+'" /></label>'+
      '<label class="import-label">Category<input data-field="category" maxlength="80" value="'+esc(draft.category)+'" /></label>'+
      '<label class="import-label">Size (optional)<input data-field="size" maxlength="120" value="'+esc(draft.size||'')+'" /></label>'+
      '<label class="import-label">Cover image<select data-field="cover">'+
      Object.keys(draft.images||{}).map(k=>'<option value="'+esc(k)+'" '+(k===draft.cover?'selected':'')+'>'+esc(k.replace(/^page-/,'PDF page ').replace(/^crop-/,'Crop '))+'</option>').join('')+
      '</select></label>'+
      (draft.cover&&draft.images?.[draft.cover]?'<button type="button" class="import-image-preview-trigger import-cover-trigger" data-import-action="preview" data-image-key="'+esc(draft.cover)+'" aria-label="Enlarge cover image"><img class="import-cover-preview" alt="Cover preview – tap to enlarge" src="'+draft.images[draft.cover]+'" /><span>⌕ View larger</span></button>':'')+
      '<p class="import-editor-hint">The PDF itself is not kept. Use the reference image dropdowns to position the original page images, or crop just the photo you need.</p>'+
      '</div></aside><div class="import-group-list">'+groupMarkup+
      '<button class="import-add-group" data-import-action="add-group">+ Add another section</button></div></div>'+
      '<div class="import-save-bar"><span>♡ Review stitch counts carefully before saving.</span>'+
      '<div><button type="button" class="btn btn-secondary" data-import-action="cancel">Cancel</button>'+
      '<button type="button" class="btn btn-primary" data-import-action="save" '+(busy?'disabled':'')+'>'+
      (busy?'Saving to your account…':'♡ Save to My Patterns')+'</button></div></div>'+
      '<p class="import-status" role="status" id="import-status"></p>');
  }
  function render(html,scrollTop=false){
    if(!root)return;
    const y=window.scrollY||0;
    root.innerHTML=html;
    if(scrollTop)window.scrollTo(0,0);
    else if(y)window.scrollTo(0,y);
  }
  function update(message,error=false){
    const status=root?.querySelector('#import-status')||root?.querySelector('.import-status');
    if(status){status.textContent=message;status.classList.toggle('import-error',error)}
  }
  function findStep(gid,sid){
    const group=draft.groups.find(g=>g.id===gid);
    return {group,step:group?.steps.find(s=>s.id===sid),index:group?.steps.findIndex(s=>s.id===sid)};
  }
  function change(event){
    const target=event.target;
    if(target?.id==='sunbeam-pdf-input'){
      const file=target.files?.[0];
      if(!file)return;
      void importFile(file);
      return;
    }
    if(!draft||!target?.dataset.field)return;
    const field=target.dataset.field;
    const {group,step,index}=findStep(target.dataset.group,target.dataset.step);
    if(field==='title'||field==='designer'||field==='category'||field==='size'){
      draft[field]=target.value;
    }else if(field==='cover'){draft.cover=target.value;render(editor())}
    else if(field==='group-title'&&group)group.title=target.value;
    else if(field==='step-title'&&step)step.title=target.value;
    else if(field==='instruction'&&step)step.instruction=target.value;
    else if(field==='image'&&step){step.image=target.value;render(editor())}
    else if(field==='move-section'&&step&&group&&target.value!==group.id){
      const dest=draft.groups.find(g=>g.id===target.value);
      if(dest){group.steps.splice(index,1);dest.steps.push(step);render(editor())}
    }
  }
  async function importFile(file){
    if(busy)return;
    busy=true;update('Preparing the PDF reader…');
    try{
      const result=await readPdf(file,message=>update(message));
      draft=result;
      render(editor(),true);
      update('Draft ready! Review the steps and move any images before saving.');
    }catch(e){render(uploadScreen(e.message),true)}
    finally{busy=false}
  }
  function action(event){
    const node=event.target.closest('[data-import-action]');
    if(!node||busy)return;
    event.preventDefault();event.stopPropagation();
    const which=node.dataset.importAction;
    if(which==='cancel'){cancel();return}
    if(which==='save'){void save();return}
    if(!draft)return;
    if(which==='preview'){void openImagePreview(node.dataset.imageKey);return}
    const {group,step,index}=findStep(node.dataset.group,node.dataset.step);
    const gi=draft.groups.indexOf(group);
    if(which==='add-group')draft.groups.push({id:id('section'),title:'New section',steps:[]});
    if(which==='group-up'&&gi>0)[draft.groups[gi-1],draft.groups[gi]]=[draft.groups[gi],draft.groups[gi-1]];
    if(which==='group-down'&&gi>=0&&gi<draft.groups.length-1)[draft.groups[gi+1],draft.groups[gi]]=[draft.groups[gi],draft.groups[gi+1]];
    if(which==='group-delete'&&group){
      if(!window.confirm('Remove this section and its steps?'))return;
      draft.groups.splice(gi,1);
    }
    if(which==='add-step'&&group)group.steps.push({id:id('step'),title:'New step',instruction:'',image:''});
    if(which==='step-up'&&group&&index>0)[group.steps[index-1],group.steps[index]]=[group.steps[index],group.steps[index-1]];
    if(which==='step-down'&&group&&index>=0&&index<group.steps.length-1)[group.steps[index+1],group.steps[index]]=[group.steps[index],group.steps[index+1]];
    if(which==='step-delete'&&group&&step){
      if(!window.confirm('Remove this step?'))return;
      group.steps.splice(index,1);
    }
    if(which==='crop'&&step){void crop(step);return}
    render(editor());
  }
  async function sourceForImage(key){
    if(!draft?.images?.[key])throw Error('This reference image is unavailable.');
    if(!pdfDocument||!/^page-[1-9]\d*$/.test(key))return draft.images[key];
    if(highQualityPages.has(key))return highQualityPages.get(key);
    const page=await pdfDocument.getPage(Number(key.slice(5)));
    try{
      const base=page.getViewport({scale:1});
      // Render from the original PDF at up to ~7 MP, rather than resizing the
      // previous 960px/0.73-quality thumbnail. Avoid iPad memory spikes.
      const scale=Math.min(4,3200/Math.max(base.width,base.height),
        Math.sqrt(7000000/Math.max(1,base.width*base.height)));
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(viewport.width));
      canvas.height=Math.max(1,Math.round(viewport.height));
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx,viewport}).promise;
      const original=canvas.toDataURL('image/webp',.96);
      canvas.width=canvas.height=0;
      highQualityPages.set(key,original);
      // Keep only the most recent two high-resolution renderings in memory.
      while(highQualityPages.size>2)
        highQualityPages.delete(highQualityPages.keys().next().value);
      return original;
    }finally{page.cleanup()}
  }
  function closeImagePreview(){
    if(!previewOverlay)return;
    previewGeneration++;
    if(previewKeyListener)document.removeEventListener('keydown',previewKeyListener,true);
    previewKeyListener=null;
    const previousOverflow=previewOverlay.dataset.previousOverflow||'';
    previewOverlay.remove();previewOverlay=null;
    document.body.style.overflow=previousOverflow;
    previewReturnFocus?.focus?.();previewReturnFocus=null;
  }
  function imageLabel(key){
    return /^page-\d+$/.test(key)?'PDF page '+key.slice(5)
      :/^crop-/.test(key)?'Cropped image':key.replace(/-/g,' ');
  }
  async function openImagePreview(key){
    if(!draft?.images?.[key])return;
    if(!previewOverlay){
      previewReturnFocus=document.activeElement;
      const overlay=document.createElement('div');
      overlay.className='import-preview-backdrop';
      overlay.dataset.previousOverflow=document.body.style.overflow||'';
      overlay.innerHTML='<div class="import-preview-dialog" role="dialog" aria-modal="true" aria-label="Enlarged reference image">'+
        '<header class="import-preview-toolbar"><div><strong>Reference image</strong><small data-preview-caption></small></div>'+
        '<div class="import-preview-tools"><button type="button" data-preview="prev" aria-label="Previous image" title="Previous image">←</button>'+
        '<button type="button" data-preview="next" aria-label="Next image" title="Next image">→</button>'+
        '<button type="button" data-preview="out" aria-label="Zoom out">−</button>'+
        '<span class="import-preview-scale" data-preview-scale>100%</span>'+
        '<button type="button" data-preview="in" aria-label="Zoom in">+</button>'+
        '<button type="button" data-preview="reset" aria-label="Fit image to screen">Fit</button>'+
        '<button type="button" class="import-preview-close" data-preview="close" aria-label="Close enlarged image">×</button></div></header>'+
        '<div class="import-preview-viewport" data-preview-viewport><div class="import-preview-loading" data-preview-loading>Loading full-size image…</div>'+
        '<img hidden data-preview-image alt="Enlarged crochet reference image" /></div>'+
        '<footer class="import-preview-hint">Tap an arrow to compare pages · Use + / − to zoom · Swipe to pan when enlarged</footer></div>';
      document.body.appendChild(overlay);
      previewOverlay=overlay;
      document.body.style.overflow='hidden';
      overlay.addEventListener('click',e=>{
        if(e.target===overlay){closeImagePreview();return}
        const button=e.target.closest('[data-preview]');
        if(!button)return;
        const action=button.dataset.preview;
        if(action==='close')closeImagePreview();
        else if(action==='in')applyPreviewZoom((previewOverlay._zoom||1)*1.4);
        else if(action==='out')applyPreviewZoom((previewOverlay._zoom||1)/1.4);
        else if(action==='reset')applyPreviewZoom(1);
        else if(action==='prev'||action==='next')void openImagePreview(
          previewKeys()[(previewIndex+(action==='next'?1:-1)+previewKeys().length)%previewKeys().length]);
      });
      previewKeyListener=e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeImagePreview()}
        else if(e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();void openImagePreview(previewKeys()[(previewIndex+1)%previewKeys().length])}
        else if(e.key==='ArrowLeft'){e.preventDefault();e.stopImmediatePropagation();void openImagePreview(previewKeys()[(previewIndex-1+previewKeys().length)%previewKeys().length])}
      };
      document.addEventListener('keydown',previewKeyListener,true);
      overlay.querySelector('[data-preview="close"]').focus();
    }
    const keys=previewKeys();
    previewIndex=Math.max(0,keys.indexOf(key));
    const seq=++previewGeneration,overlay=previewOverlay;
    const viewport=overlay.querySelector('[data-preview-viewport]');
    const image=overlay.querySelector('[data-preview-image]');
    image.hidden=true;
    overlay.querySelector('[data-preview-loading]').hidden=false;
    overlay.querySelector('[data-preview-caption]').textContent=imageLabel(key)+' · '+(previewIndex+1)+' of '+keys.length;
    overlay.querySelectorAll('[data-preview="prev"],[data-preview="next"]').forEach(b=>b.disabled=keys.length<2);
    try{
      const src=await sourceForImage(key);
      if(seq!==previewGeneration||overlay!==previewOverlay)return;
      image.onload=()=>{
        if(seq!==previewGeneration)return;
        image.hidden=false;overlay.querySelector('[data-preview-loading]').hidden=true;
        applyPreviewZoom(1);viewport.scrollTo(0,0);
      };
      image.src=src;
    }catch(error){
      if(seq===previewGeneration)overlay.querySelector('[data-preview-loading]').textContent='Could not load this image.';
    }
  }
  function previewKeys(){return Object.keys(draft?.images||{}).filter(key=>draft.images[key])}
  function applyPreviewZoom(level){
    if(!previewOverlay)return;
    const image=previewOverlay.querySelector('[data-preview-image]');
    if(!image||!image.naturalWidth)return;
    const viewport=previewOverlay.querySelector('[data-preview-viewport]');
    const factor=Math.max(.4,Math.min(4,level));
    const fitWidth=Math.min(image.naturalWidth,Math.max(260,viewport.clientWidth-24));
    image.style.width=Math.round(fitWidth*factor)+'px';
    image.style.maxWidth='none';image.style.maxHeight='none';
    previewOverlay._zoom=factor;
    previewOverlay.querySelector('[data-preview-scale]').textContent=Math.round(factor*100)+'%';
  }
  async function crop(step){
    if(!step.image||!draft.images[step.image])return;
    // The selection preview may be a low-resolution PDF page thumbnail.
    // Re-render its source page directly from the PDF before cropping.
    const imageKey=step.image;
    let original;
    try{
      update('Preparing a high-quality image for cropping…');
      original=await sourceForImage(imageKey);
    }catch{original=draft.images[imageKey]}
    if(!root||!draft?.images?.[imageKey])return;
    const overlay=document.createElement('div');
    overlay.className='import-crop-backdrop';
    overlay.innerHTML='<div class="import-crop-dialog" role="dialog" aria-modal="true" aria-label="Crop reference image">'+
      '<h2>Crop your reference image</h2><p>Drag on the picture to select the area you want to keep.</p>'+
      '<canvas id="import-crop-canvas" aria-label="Drag to select a rectangle in the image"></canvas>'+
      '<div class="import-crop-actions"><button class="btn btn-secondary" data-crop="cancel">Cancel</button>'+
      '<button class="btn btn-primary" data-crop="apply">Use this crop</button></div></div>';
    document.body.appendChild(overlay);
    const canvas=overlay.querySelector('canvas'),ctx=canvas.getContext('2d');
    const img=new Image();let rect=null,start=null;
    const redraw=()=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      if(rect){
        ctx.fillStyle='rgba(48,42,38,.4)';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,rect.x*img.naturalWidth/canvas.width,
          rect.y*img.naturalHeight/canvas.height,
          rect.w*img.naturalWidth/canvas.width,rect.h*img.naturalHeight/canvas.height,
          rect.x,rect.y,rect.w,rect.h);
        ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);
      }
    };
    img.onload=()=>{
      const scale=Math.min(1,780/Math.max(img.naturalWidth,1),560/Math.max(img.naturalHeight,1));
      canvas.width=Math.round(img.naturalWidth*scale);
      canvas.height=Math.round(img.naturalHeight*scale);
      redraw();
    };
    img.src=original;
    const point=e=>{
      const b=canvas.getBoundingClientRect();
      return {x:Math.max(0,Math.min(canvas.width,(e.clientX-b.left)*canvas.width/b.width)),
        y:Math.max(0,Math.min(canvas.height,(e.clientY-b.top)*canvas.height/b.height))};
    };
    canvas.addEventListener('pointerdown',e=>{start=point(e);rect=null;canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener('pointermove',e=>{
      if(!start)return;const p=point(e);rect={
        x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),
        w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};redraw()
    });
    canvas.addEventListener('pointerup',()=>{start=null;redraw()});
    overlay.querySelector('[data-crop="cancel"]').addEventListener('click',()=>overlay.remove());
    overlay.querySelector('[data-crop="apply"]').addEventListener('click',()=>{
      if(!rect||rect.w<12||rect.h<12){overlay.remove();return}
      // Do not upscale a small crop, which would only amplify blur.
      const sourceWidth=rect.w*img.naturalWidth/canvas.width;
      const sourceHeight=rect.h*img.naturalHeight/canvas.height;
      const size=Math.min(1,2400/Math.max(sourceWidth,sourceHeight));
      const result=document.createElement('canvas');
      result.width=Math.max(1,Math.round(sourceWidth*size));
      result.height=Math.max(1,Math.round(sourceHeight*size));
      result.getContext('2d').drawImage(img,rect.x*img.naturalWidth/canvas.width,
        rect.y*img.naturalHeight/canvas.height,rect.w*img.naturalWidth/canvas.width,
        rect.h*img.naturalHeight/canvas.height,0,0,result.width,result.height);
      const key=id('crop');
      draft.images[key]=result.toDataURL('image/webp',.94);
      step.image=key;result.width=result.height=0;
      overlay.remove();render(editor());
    });
  }
  async function save(){
    if(busy||!draft)return;
    busy=true;
    const button=root.querySelector('[data-import-action="save"]');
    if(button){button.disabled=true;button.textContent='Saving…'}
    update('Uploading only the selected guide images. The PDF itself is not uploaded.');
    try{
      const result=await window.SunbeamCustomPatterns.save(draft);
      const savedId=result.id;
      const finish=callbacks?.onSaved;
      stop();
      await finish?.(result,savedId);
    }catch(error){
      busy=false;update('Could not save your guide: '+error.message,true);
      if(button){button.disabled=false;button.textContent='♡ Save to My Patterns'}
    }
  }
  function stop(){
    if(root&&bindRoot){
      root.removeEventListener('click',bindRoot.click);
      root.removeEventListener('change',bindRoot.change);
      root.removeEventListener('input',bindRoot.input);
    }
    document.querySelector('.import-crop-backdrop')?.remove();
    closeImagePreview();
    highQualityPages.clear();
    const oldDoc=pdfDocument;pdfDocument=null;
    if(oldDoc)void oldDoc.destroy().catch(()=>{});
    // Release original PDF document and all unsaved photo data from memory.
    draft=null;busy=false;bindRoot=null;root=null;callbacks=null;
  }
  function cancel(){const done=callbacks?.onCancel;stop();done?.()}
  function start(container,handlers,existing=null){
    stop();root=container;callbacks=handlers;
    draft=existing?{...existing,images:{...existing.images},
      imagePaths:{...existing.imagePaths},existingImages:{...existing.images},
      groups:existing.groups.map(g=>({...g,steps:g.steps.map(s=>({...s}))}))}:null;
    bindRoot={click:action,change,input:change};
    root.addEventListener('click',bindRoot.click);
    root.addEventListener('change',bindRoot.change);
    root.addEventListener('input',bindRoot.input);
    render(draft?editor():uploadScreen(),true);
  }
  window.SunbeamPdfImporter=Object.freeze({start,stop,readPdf,parsePages,linesFromText});
})();