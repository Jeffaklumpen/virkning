/* Sunbeam cloud: Supabase Auth and user-scoped progress via native HTTPS APIs.
   Only the public publishable key ships to the browser. Guides never leave the device. */
(() => {
  'use strict';
  const config=window.SUNBEAM_SUPABASE_CONFIG;
  const STORE='sunbeam-cloud-session-v1';
  let session=null,member=null,restoreJob=null,refreshJob=null,knownIds=[];
  let syncStatus='local';
  const pending=new Map(),running=new Set();
  const storage=()=>window.SunbeamStorage;
  const dispatch=()=>document.dispatchEvent(new Event('sunbeam-cloud-status'));
  const setStatus=value=>{syncStatus=value;dispatch()};
  function state(){
    return {connected:!!member,email:session?.user?.email||'',role:member?.role||'',
      status:syncStatus};
  }
  function cacheSession(){
    if(session&&member)localStorage.setItem(STORE,JSON.stringify({session,member}));
    else localStorage.removeItem(STORE);
  }
  function reset(){
    session=null;member=null;restoreJob=null;refreshJob=null;
    cacheSession();setStatus('local');
  }
  async function rawRequest(path,options={}){
    const headers={'apikey':config.publishableKey,'Accept':'application/json'};
    if(options.body!==undefined)headers['Content-Type']='application/json';
    if(options.accessToken)headers.Authorization='Bearer '+options.accessToken;
    if(options.prefer)headers.Prefer=options.prefer;
    const result=await fetch(config.url+path,{method:options.method||'GET',headers,
      body:options.body===undefined?undefined:JSON.stringify(options.body)});
    if(!result.ok){
      const detail=await result.json().catch(()=>({}));
      const error=new Error(detail.msg||detail.message||detail.error_description||
        detail.error||'Cloud request failed ('+result.status+')');
      error.status=result.status;
      throw error;
    }
    if(result.status===204||options.emptyResponse)return null;
    return result.json();
  }
  async function renew(){
    if(refreshJob)return refreshJob;
    if(!session?.refresh_token)throw Error('Please sign in to cloud backup again.');
    refreshJob=(async()=>{
      const fresh=await rawRequest('/auth/v1/token?grant_type=refresh_token',{
        method:'POST',body:{refresh_token:session.refresh_token}});
      session={...fresh,expires_at:Math.floor(Date.now()/1000)+Number(fresh.expires_in||3600)};
      cacheSession();
      return session;
    })().finally(()=>{refreshJob=null});
    return refreshJob;
  }
  async function accessToken(){
    if(!session)throw Error('Cloud account is not connected.');
    if((session.expires_at||0)<Math.floor(Date.now()/1000)+60)await renew();
    return session.access_token;
  }
  async function request(path,options={}){
    let token=await accessToken();
    try{return await rawRequest(path,{...options,accessToken:token})}
    catch(error){
      if(error.status!==401)throw error;
      await renew();
      token=await accessToken();
      return rawRequest(path,{...options,accessToken:token});
    }
  }
  async function verifyMembership(candidate){
    if(!candidate?.user?.id||!candidate.access_token)throw Error('Invalid cloud session.');
    const path='/rest/v1/sunbeam_members?select=user_id,role,display_name,enabled&user_id=eq.'+
      encodeURIComponent(candidate.user.id)+'&limit=1';
    const rows=await rawRequest(path,{accessToken:candidate.access_token});
    if(!rows?.[0]?.enabled)throw Error('This account is not yet approved for Sunbeam. Ask the administrator to invite it.');
    return rows[0];
  }
  async function login(email,password){
    if(!email||!password)throw Error('Enter your email and account password.');
    const answer=await rawRequest('/auth/v1/token?grant_type=password',{
      method:'POST',body:{email:email.trim(),password}});
    answer.expires_at=Math.floor(Date.now()/1000)+Number(answer.expires_in||3600);
    const approved=await verifyMembership(answer);
    session=answer;member=approved;restoreJob=Promise.resolve(member);
    cacheSession();setStatus('connecting');
    return member;
  }
  function restore(){
    if(restoreJob)return restoreJob;
    restoreJob=(async()=>{
      let saved=null;
      try{saved=JSON.parse(localStorage.getItem(STORE)||'null')}catch{}
      if(!saved?.session?.user?.id||!saved?.member?.user_id)return null;
      session=saved.session;
      try{
        const token=await accessToken();
        member=await verifyMembership({...session,access_token:token});
        cacheSession();setStatus('connecting');
        return member;
      }catch(error){
        if(!navigator.onLine && saved.member.user_id===saved.session.user.id){
          member=saved.member;setStatus('offline');return member;
        }
        reset();return null;
      }
    })();
    return restoreJob;
  }
  async function disconnect(){
    // Invalidate the server session where possible, then lock this browser.
    try{if(session?.access_token)await rawRequest('/auth/v1/logout',{
      method:'POST',accessToken:session.access_token,emptyResponse:true})}catch{}
    for(const timer of pending.values())clearTimeout(timer);
    pending.clear();knownIds=[];reset();
  }
  function progressPath(){
    return '/rest/v1/sunbeam_progress?select=pattern_id,progress,modified_at&user_id=eq.'+
      encodeURIComponent(session.user.id);
  }
  async function saveOne(id){
    if(!member||running.has(id))return;
    const record=storage().getProgressRecord(id);
    if(!record.present||!record.dirty)return;
    running.add(id);setStatus('saving');
    try{
      await request('/rest/v1/sunbeam_progress?on_conflict=user_id,pattern_id',{
        method:'POST',prefer:'resolution=merge-duplicates,return=minimal',
        emptyResponse:true,
        body:{user_id:session.user.id,pattern_id:id,progress:record.progress,
          modified_at:new Date().toISOString()}});
      storage().markProgressSynced(id,record.dirty);
      setStatus('synced');
    }catch(error){
      setStatus(navigator.onLine?'error':'offline');
    }finally{
      running.delete(id);
      const changed=storage().getProgressRecord(id);
      if(changed.dirty&&changed.dirty!==record.dirty)schedule(id);
    }
  }
  function schedule(id){
    if(!member)return;
    if(pending.has(id))clearTimeout(pending.get(id));
    setStatus(navigator.onLine?'saving':'offline');
    pending.set(id,setTimeout(()=>{
      pending.delete(id);
      void saveOne(id);
    },750));
  }
  async function syncAll(ids){
    if(!member)return;
    knownIds=[...new Set(ids)];
    for(const timer of pending.values())clearTimeout(timer);
    pending.clear();
    setStatus('connecting');
    try{
      const list=await request(progressPath());
      const cloud=new Map((list||[]).map(row=>[row.pattern_id,row.progress]));
      for(const id of knownIds){
        const local=storage().getProgressRecord(id);
        const remote=cloud.get(id);
        // The first migration of old Kimsi data never overwrites an existing cloud copy.
        if(remote && (!local.dirty||local.dirty==='bootstrap')){
          storage().applyCloudProgress(id,remote);
        }else if(local.present && (!remote||local.dirty)){
          await saveOne(id);
        }
      }
      if(syncStatus!=='error'&&syncStatus!=='offline')setStatus('synced');
    }catch(error){setStatus(navigator.onLine?'error':'offline')}
  }
  window.addEventListener('online',()=>{
    if(member&&knownIds.length)void syncAll(knownIds);
  });
  window.SunbeamCloud=Object.freeze({state,login,restore,disconnect,syncAll,schedule});
})();