/* A little private yarn journal inside the existing collapsible pattern notes.
   Catalog searches are local; only a chosen yarn triggers a colorway lookup. */
(() => {
 'use strict';
 const {esc}=window.SunbeamPatterns;
 const catalog=()=>window.SunbeamYarnCatalog;
 const short=(s,n=160)=>String(s??'').slice(0,n);
 const validColor=s=>/^#[a-f0-9]{6}$/i.test(s||'')?s:'#e9d8c8';
 function renderSaved(items){
   if(!items.length)return '<p class="yarn-empty">Your yarn choices will appear here, ready for the next time you make this pattern. ♡</p>';
   return items.map((item,i)=>'<div class="yarn-saved-card">'+
     '<span class="yarn-color-dot" style="background:'+validColor(item.hex)+'" aria-hidden="true"></span>'+
     '<div class="yarn-saved-info"><strong>'+esc(short(item.brandName,100))+' · '+esc(short(item.yarnName,140))+'</strong>'+
     (item.colorName?'<small>'+esc(short(item.colorName,140))+'</small>':'')+
     '<span>'+[item.quantity, item.hook?item.hook+' hook':'',item.memo]
       .filter(Boolean).map(x=>esc(short(x,180))).join(' · ')+'</span></div>'+
     '<div class="yarn-saved-tools">'+
       '<button type="button" data-yarn-action="edit" data-index="'+i+'" title="Edit yarn" aria-label="Edit yarn">✎</button>'+
       '<button type="button" data-yarn-action="remove" data-index="'+i+'" title="Remove yarn" aria-label="Remove yarn">×</button>'+
     '</div></div>').join('');
 }
 function mount(root,options){
   if(!root)return;
   let items=(Array.isArray(options.items)?options.items:[]).slice(0,40);
   let choices=[],suggestions=[],colors=[],selection=null,selectionKey='',selectedColor='';
   let editIndex=-1,working=false,error='',query='',catalogStatus='',colorsStatus='';
   let savedDraft={quantity:'',hook:'',memo:''};
   let operation=0;
   const alive=()=>root.isConnected&&options.isActive();
   const noteCount=()=>{const node=root.closest('.pattern-notes')?.querySelector('.pattern-notes-count');
     if(node)node.textContent=items.length?items.length+' yarn'+(items.length===1?'':'s')+' saved':'Add yarn or a note'};
   function summary(){
     return '<div class="yarn-journal-header"><div class="yarn-journal-title">'+
       '<span class="yarn-ball-icon" aria-hidden="true">◉</span><div><h3>Yarn used</h3>'+
       '<p>Remember the yarns, colors and hook you used.</p></div></div>'+
       '<button type="button" class="yarn-add-toggle" data-yarn-action="'+(working?'cancel':'add')+'">'+
       (working?'× Cancel':'+ Add yarn')+'</button></div>'+
       '<div class="yarn-saved-list">'+renderSaved(items)+'</div>';
   }
   function preview(){
     if(!working)return '';
     return '<div class="yarn-finder">'+
       '<label for="sunbeam-yarn-search">Find a yarn</label>'+
       '<div class="yarn-search-field"><span aria-hidden="true">⌕</span>'+
       '<input id="sunbeam-yarn-search" type="search" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="Search brand or yarn, e.g. Hobbii Cotton" maxlength="90" value="'+esc(query)+'" /></div>'+
       '<p class="yarn-cache-status" id="yarn-catalog-status" role="status">'+esc(catalogStatus)+'</p>'+
       '<div class="yarn-search-results" id="yarn-search-results" aria-live="polite"></div>'+
       (selection?'<div class="yarn-choice-card"><div class="yarn-choice-title">'+
         '<span class="yarn-color-dot yarn-color-large" id="yarn-choice-swatch" style="background:'+validColor(colors.find(c=>c.name===selectedColor)?.hex)+'"></span>'+
         '<div><strong>'+esc(selection.brandName)+' · '+esc(selection.yarnName)+'</strong>'+
         '<small>'+esc(selection.yarnWeightId||'Yarn')+'</small></div></div>'+
         '<label for="sunbeam-yarn-color">Color / shade</label>'+
         '<select id="sunbeam-yarn-color"><option value="">'+esc(colorsStatus||'Choose a color (optional)')+'</option>'+
         colors.map((c,i)=>c.unavailable?'':'<option value="'+i+'" '+
           (c.name===selectedColor?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select>'+
         '<div class="yarn-extra-grid">'+
          '<label>How much did you use?<input id="sunbeam-yarn-quantity" maxlength="70" placeholder="e.g. 2 skeins / 100 g" value="'+esc(savedDraft.quantity)+'" /></label>'+
          '<label>Hook size<input id="sunbeam-yarn-hook" maxlength="40" placeholder="e.g. 3.5 mm" value="'+esc(savedDraft.hook)+'" /></label>'+
         '</div><label>Little reminder (optional)<input id="sunbeam-yarn-memo" maxlength="180" placeholder="e.g. Perfect for the ears" value="'+esc(savedDraft.memo)+'" /></label>'+
         '<div class="yarn-form-actions"><span>Only saved when you press the button.</span>'+
         '<button class="btn btn-primary yarn-save-button" type="button" data-yarn-action="save" '+(!!selection?'':'disabled')+'>'+
         (editIndex>=0?'Save changes':'Save yarn')+'</button></div></div>':'')+
       (error?'<p class="yarn-error" role="alert">'+esc(error)+'</p>':'')+
       '</div>';
   }
   function draw(){
     if(!alive())return;
     root.innerHTML=summary()+preview()+
       '<p class="yarn-attribution">Yarn data: <a href="https://temperature-blanket.com/api/yarn-colorways" target="_blank" rel="noopener noreferrer">temperature-blanket.com</a> · CC BY 4.0. Colors are approximate.</p>';
     noteCount();
     showSuggestions();
   }
   function showSuggestions(){
     const list=root.querySelector('#yarn-search-results');
     if(!list)return;
     if(!query.trim()||query.trim().length<2){list.innerHTML='<p class="yarn-search-hint">Type at least two letters to find yarns.</p>';return}
     suggestions=catalog().search(choices,query);
     list.innerHTML=suggestions.length?suggestions.map((item,i)=>
       '<button type="button" class="yarn-result" data-yarn-action="choose" data-index="'+i+'">'+
       '<span class="yarn-result-brand">'+esc(item.brandName)+'</span>'+
       '<strong>'+esc(item.yarnName)+'</strong><span aria-hidden="true">＋</span></button>').join(''):
       '<p class="yarn-search-hint">'+(choices.length?'No yarn found. Try another brand or name.':'The yarn catalog is not loaded yet.')+'</p>';
   }
   async function loadCatalog(){
     const token=++operation;
     catalogStatus='Loading yarn catalog…';error='';
     draw();
     try{
       const data=await catalog().catalog();
       if(token!==operation||!alive())return;
       choices=data.items.filter(item=>item.brandId&&item.yarnId&&!item.unavailable);
       catalogStatus=data.warning|| (data.from==='device'?'Using saved yarn catalog · no API request':
         'Yarn catalog ready · results update as you type');
       draw();
     }catch(e){
       if(token!==operation||!alive())return;
       catalogStatus='Yarn catalog is unavailable.';
       error=short(e.message,180);draw();
     }
   }
   async function choose(item,fromEdit=false){
     selection=item;selectionKey=item.brandId+':'+item.yarnId;
     colors=[];colorsStatus='Loading available colors…';error='';
     draw();
     const key=selectionKey;
     try{
       const data=await catalog().colors(item.brandId,item.yarnId);
       if(!alive()||!working||selectionKey!==key)return;
       colors=data.items;
       colorsStatus=data.warning||'Choose a color (optional)';
       if(fromEdit && savedDraft.colorName){
         const match=colors.find(c=>c.name===savedDraft.colorName);
         if(match)selectedColor=match.name;
       }
       draw();
     }catch(e){
       if(!alive()||!working||selectionKey!==key)return;
       colorsStatus='Colors unavailable · you can still save this yarn';
       error=short(e.message,180);draw();
     }
   }
   function capture(){
     if(!working)return;
     savedDraft.quantity=short(root.querySelector('#sunbeam-yarn-quantity')?.value||savedDraft.quantity,70);
     savedDraft.hook=short(root.querySelector('#sunbeam-yarn-hook')?.value||savedDraft.hook,40);
     savedDraft.memo=short(root.querySelector('#sunbeam-yarn-memo')?.value||savedDraft.memo,180);
   }
   function cancel(){
     ++operation;working=false;editIndex=-1;selection=null;selectionKey='';
     selectedColor='';query='';error='';draw();
   }
   function beginEdit(index){
     const saved=items[index];if(!saved)return;
     editIndex=index;working=true;query=saved.brandName+' '+saved.yarnName;
     selectedColor=saved.colorName||'';
     savedDraft={quantity:saved.quantity||'',hook:saved.hook||'',memo:saved.memo||'',
       colorName:saved.colorName||''};
     void choose(saved,true);
     if(!choices.length)void loadCatalog();
     root.querySelector('#sunbeam-yarn-search')?.focus();
   }
   async function save(){
     if(!selection)return;
     capture();
     const color=colors.find(c=>c.name===selectedColor);
     const existing=editIndex>=0?items[editIndex]:null;
     const entry={
       id:existing?.id||crypto.randomUUID(),
       brandId:short(selection.brandId,65),brandName:short(selection.brandName,120),
       yarnId:short(selection.yarnId,65),yarnName:short(selection.yarnName,160),
       yarnWeightId:short(selection.yarnWeightId||'',25),
       colorName:short(selectedColor,160),hex:color?.hex||existing?.hex||'',
       quantity:short(savedDraft.quantity,70),hook:short(savedDraft.hook,40),
       memo:short(savedDraft.memo,180)
     };
     const updated=items.slice();
     if(editIndex>=0)updated[editIndex]=entry;
     else if(updated.length<40)updated.push(entry);
     else {error='You can save up to 40 yarns per pattern.';draw();return}
     items=updated;options.onSave(items);cancel();
   }
   root.addEventListener('click',e=>{
     const node=e.target.closest('[data-yarn-action]');
     if(!node||!root.contains(node))return;
     e.preventDefault();e.stopPropagation();
     const action=node.dataset.yarnAction;
     if(action==='cancel'){cancel();return}
     if(action==='add'){
       editIndex=-1;working=true;selection=null;query='';selectedColor='';
       savedDraft={quantity:'',hook:'',memo:''};
       error='';catalogStatus='';draw();
       if(!choices.length)void loadCatalog();
       root.querySelector('#sunbeam-yarn-search')?.focus();return;
     }
     if(action==='choose'){capture();const selected=suggestions[Number(node.dataset.index)];
       if(selected){selectedColor='';void choose(selected)}return}
     if(action==='edit'){beginEdit(Number(node.dataset.index));return}
     if(action==='remove'){
       const index=Number(node.dataset.index);
       if(!items[index]||!window.confirm('Remove this yarn from your pattern?'))return;
       items=items.filter((_,i)=>i!==index);
       options.onSave(items);draw();return;
     }
     if(action==='save')void save();
   });
   root.addEventListener('input',e=>{
     if(e.target?.id==='sunbeam-yarn-search'){
       query=short(e.target.value,90);showSuggestions();
     }else if(['sunbeam-yarn-quantity','sunbeam-yarn-hook','sunbeam-yarn-memo'].includes(e.target?.id)){
       capture();
     }
   });
   root.addEventListener('change',e=>{
     if(e.target?.id==='sunbeam-yarn-color'){
       const color=colors[Number(e.target.value)];
       selectedColor=e.target.value===''?'':(color?.name||'');
       root.querySelector('#yarn-choice-swatch')?.style.setProperty('background',validColor(color?.hex));
     }
   });
   draw();
 }
 window.SunbeamYarnUI=Object.freeze({mount,renderSaved});
})();