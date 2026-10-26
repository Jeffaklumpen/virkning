/* User-owned guides. Only structured guide JSON and selected WebP images are
   uploaded. The uploaded PDF never touches the network or persistent storage. */
(() => {
  'use strict';
  const cloud=()=>window.SunbeamCloud;
  const bucket='sunbeam-pattern-images';
  const validId=id=>/^my-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
  const validKey=key=>/^[a-z0-9-]{2,64}$/.test(key);
  const currentUser=()=>{
    const state=cloud().state();
    if(!state.connected||!state.userId)throw Error('Please sign in to save your pattern.');
    return state.userId;
  };
  const namePath=name=>name.split('/').map(encodeURIComponent).join('/');
  async function asDataUrl(blob) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(Error('Could not read this private photo.'));
      reader.readAsDataURL(blob);
    });
  }
  async function photo(path){
    const user=currentUser();
    if(typeof path!=='string'||!path.startsWith(user+'/')||
       !/^[0-9a-f-]{36}\/my-[0-9a-f-]{36}\/[a-z0-9-]+\.webp$/.test(path))
      throw Error('Invalid private photo path');
    const response=await cloud().authenticatedFetch('/storage/v1/object/authenticated/'+bucket+'/'+namePath(path));
    return asDataUrl(await response.blob());
  }
  async function upload(guideId,key,image){
    if(!validId(guideId)||!validKey(key)||!/^data:image\/webp;base64,/i.test(image))
      throw Error('Invalid image for private upload');
    const b64=image.slice(image.indexOf(',')+1);
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    if(bytes.byteLength>5*1024*1024)throw Error('A cropped image is too large. Reduce its size.');
    const path=currentUser()+'/'+guideId+'/'+key+'-'+crypto.randomUUID()+'.webp';
    await cloud().authenticatedFetch('/storage/v1/object/'+bucket+'/'+namePath(path),{
      method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:bytes
    });
    return path;
  }
  function meta(row,cover){
    const data=row.payload||{};
    return {id:row.id,title:row.title,designer:data.designer||'My patterns',
      category:data.category||'Amigurumi',difficulty:data.difficulty||'Crochet',
      size:data.size||'',custom:true,images:cover?{cover}:{}};
  }
  async function list(){
    const user=currentUser();
    const response=await cloud().authenticatedFetch('/rest/v1/sunbeam_custom_patterns?select=id,title,payload,updated_at&user_id=eq.'+
      encodeURIComponent(user)+'&order=created_at.asc');
    const rows=await response.json();
    const records=await Promise.all(rows.map(async row=>{
      let cover=null;
      const coverPath=row.payload?.imagePaths?.[row.payload?.cover||'cover'];
      if(coverPath)try{cover=await photo(coverPath)}catch{}
      return meta(row,cover);
    }));
    return records;
  }
  async function load(id){
    if(!validId(id))throw Error('Not a custom guide');
    const user=currentUser();
    const response=await cloud().authenticatedFetch(
      '/rest/v1/sunbeam_custom_patterns?select=id,title,payload&user_id=eq.'+
      encodeURIComponent(user)+'&id=eq.'+encodeURIComponent(id)+'&limit=1');
    const [row]=await response.json();
    if(!row?.payload)throw Error('Your private guide could not be found');
    const guide={...row.payload,id:row.id,title:row.title,custom:true,images:{}};
    for(const [key,path] of Object.entries(guide.imagePaths||{})){
      if(validKey(key))try{guide.images[key]=await photo(path)}catch{}
    }
    return guide;
  }
  async function save(draft){
    const user=currentUser();
    const id=validId(draft.id)?draft.id:'my-'+crypto.randomUUID();
    const title=String(draft.title||'Untitled pattern').trim().slice(0,160);
    const groups=(draft.groups||[]).map((group,i)=>({
      id:validKey(group.id)?group.id:'section-'+(i+1),
      title:String(group.title||'Section '+(i+1)).slice(0,150),
      steps:(group.steps||[]).map((step,j)=>({
        id:validKey(step.id)?step.id:'step-'+(j+1),
        title:String(step.title||'Step '+(j+1)).slice(0,160),
        instruction:String(step.instruction||'').slice(0,10000),
        ...(validKey(step.image)?{image:step.image}:{})
      }))
    }));
    if(!title||!groups.length||!groups.some(g=>g.steps.length))
      throw Error('Add at least one section with a step before saving.');
    if(groups.length>100||groups.flatMap(g=>g.steps).length>1500)
      throw Error('This guide has too many steps.');
    const used=new Set(groups.flatMap(g=>g.steps.map(s=>s.image).filter(Boolean)));
    const cover=validKey(draft.cover)?draft.cover:'cover';
    if(draft.images?.[cover]||draft.imagePaths?.[cover])used.add(cover);
    const imagePaths={};
    for(const key of used){
      const image=draft.images?.[key];
      if(typeof image==='string'&&image.startsWith('data:image/webp;base64,')){
        // An unchanged downloaded picture keeps its old authenticated path.
        if(draft.imagePaths?.[key] && draft.existingImages?.[key]===image)
          imagePaths[key]=draft.imagePaths[key];
        else imagePaths[key]=await upload(id,key,image);
      }else if(draft.imagePaths?.[key]){
        imagePaths[key]=draft.imagePaths[key];
      }
    }
    const payload={id,title,designer:String(draft.designer||'My patterns').slice(0,120),
      category:String(draft.category||'Amigurumi').slice(0,80),
      difficulty:String(draft.difficulty||'Crochet').slice(0,60),
      size:String(draft.size||'').slice(0,120),groups,imagePaths,cover,custom:true,revision:1};
    await cloud().authenticatedFetch('/rest/v1/sunbeam_custom_patterns?on_conflict=user_id,id',{
      method:'POST',headers:{'Content-Type':'application/json',
        Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({user_id:user,id,title,payload,updated_at:new Date().toISOString()})
    });
    return {...payload,images:Object.fromEntries([...used]
      .filter(key=>draft.images?.[key]).map(key=>[key,draft.images[key]]))};
  }
  async function listStoredPhotos(user,id){
    const prefix=user+'/'+id+'/';
    const objects=[];
    for(let offset=0;offset<=10000;offset+=1000){
      const response=await cloud().authenticatedFetch('/storage/v1/object/list/'+bucket,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prefix,limit:1000,offset,sortBy:{column:'name',order:'asc'}})
      });
      const batch=await response.json();
      if(!Array.isArray(batch))throw Error('Could not inspect stored pattern images.');
      for(const object of batch){
        if(typeof object.name==='string'&&/^[a-z0-9-]+\.webp$/.test(object.name))
          objects.push(prefix+object.name);
      }
      if(batch.length<1000)return objects;
    }
    throw Error('Too many stored images to delete in one operation.');
  }
  async function remove(id){
    if(!validId(id))throw Error('Only your imported guides can be deleted.');
    const user=currentUser();
    const selector='user_id=eq.'+encodeURIComponent(user)+'&id=eq.'+encodeURIComponent(id);
    const response=await cloud().authenticatedFetch('/rest/v1/sunbeam_custom_patterns?select=id,payload&'+selector+'&limit=1');
    const [row]=await response.json();
    if(!row?.payload)throw Error('This pattern no longer exists in your account.');
    const prefix=user+'/'+id+'/';
    const stored=await listStoredPhotos(user,id);
    const referenced=Object.values(row.payload.imagePaths||{})
      .filter(path=>typeof path==='string'&&path.startsWith(prefix));
    const images=[...new Set([...stored,...referenced])];
    // Prevent a delayed upload from a previous open guide from resurrecting
    // deleted progress and notes in the user's database.
    await cloud().blockPatternSync(id);
    // Delete every Storage object in the folder, including abandoned photos
    // from earlier edits (not only photos referenced by the latest revision).
    for(let start=0;start<images.length;start+=500){
      await cloud().authenticatedFetch('/storage/v1/object/'+bucket,{
        method:'DELETE',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prefixes:images.slice(start,start+500)})
      });
    }
    const leftovers=await listStoredPhotos(user,id);
    if(leftovers.length)throw Error('Some images could not be removed; the guide is still available. Try again.');
    // RLS authorizes DELETE only for the owner of these rows.
    await cloud().authenticatedFetch('/rest/v1/sunbeam_progress?user_id=eq.'+
      encodeURIComponent(user)+'&pattern_id=eq.'+encodeURIComponent(id),{method:'DELETE'});
    await cloud().authenticatedFetch('/rest/v1/sunbeam_custom_patterns?'+selector,{method:'DELETE'});
    const confirm=await cloud().authenticatedFetch(
      '/rest/v1/sunbeam_custom_patterns?select=id&'+selector);
    if((await confirm.json()).length)
      throw Error('Could not confirm permanent deletion. Try again.');
    return {removed:true,imagesRemoved:images.length};
  }
  window.SunbeamCustomPatterns=Object.freeze({list,load,save,remove,validId});
})();