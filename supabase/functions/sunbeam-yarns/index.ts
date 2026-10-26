/* Protected Colorways v3 API proxy with shared response cache. */
const HOST='https://yarn-colorways.p.rapidapi.com/v3';
const ORIGIN='https://jeffaklumpen.github.io';
const DB=Deno.env.get('SUPABASE_URL')||'';
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const KEY=Deno.env.get('YARN_COLORWAYS_API_KEY')||'';
const short=s=>typeof s==='string'?s:'';
const authHeaders={apikey:ANON};
const serverHeaders={apikey:SERVICE,Authorization:'Bearer '+SERVICE};
const memory=new Map(),pending=new Map();
function cors(origin){const allow=origin===ORIGIN||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
 return {'Access-Control-Allow-Origin':allow?origin:ORIGIN,
 'Access-Control-Allow-Methods':'GET, OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 Vary:'Origin','Cache-Control':'private, no-store'};}
function json(data,status,origin){return new Response(JSON.stringify(data),{
 status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}})}
async function approved(request){
 const bearer=request.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(bearer))return false;
 const response=await fetch(DB+'/auth/v1/user',{headers:{...authHeaders,Authorization:bearer}});
 if(!response.ok)return false;
 const person=await response.json();
 if(!/^[0-9a-f-]{36}$/i.test(person.id||''))return false;
 const url=DB+'/rest/v1/sunbeam_members?select=user_id&user_id=eq.'+
   encodeURIComponent(person.id)+'&enabled=is.true&limit=1';
 const member=await fetch(url,{headers:{...authHeaders,Authorization:bearer}});
 return member.ok&&(await member.json()).length>0;
}
async function readCache(key){
 if(memory.has(key))return memory.get(key);
 const r=await fetch(DB+'/rest/v1/sunbeam_yarn_api_cache?select=payload,fetched_at&cache_key=eq.'+
   encodeURIComponent(key)+'&limit=1',{headers:serverHeaders});
 if(!r.ok)throw Error('Private yarn cache is unavailable');
 const [item]=await r.json();
 if(!item)return null;
 const entry={data:item.payload,at:Date.parse(item.fetched_at)||0};
 memory.set(key,entry);
 if(memory.size>60)memory.delete(memory.keys().next().value);
 return entry;
}
async function writeCache(key,data){
 const response=await fetch(DB+'/rest/v1/sunbeam_yarn_api_cache?on_conflict=cache_key',{
  method:'POST',headers:{...serverHeaders,'Content-Type':'application/json',
  Prefer:'resolution=merge-duplicates,return=minimal'},
  body:JSON.stringify({cache_key:key,payload:data,fetched_at:new Date().toISOString()})
 });
 if(!response.ok)throw Error('Cannot update private yarn cache');
 memory.set(key,{data,at:Date.now()});
}
async function upstream(type,brand,yarn){
 const query=type==='colors'?'?brand='+encodeURIComponent(brand)+'&yarn='+
  encodeURIComponent(yarn)+'&limit=500':'';
 const response=await fetch(HOST+'/'+(type==='catalog'?'yarns':'colorways')+query,{
  headers:{'X-RapidAPI-Key':KEY,'X-RapidAPI-Host':'yarn-colorways.p.rapidapi.com',
    Accept:'application/json'},signal:AbortSignal.timeout(12000)
 });
 if(!response.ok){
  const error=new Error(response.status===429?'Monthly Yarn Colorways API limit reached.':
   response.status===401||response.status===403?
   'API access denied. Check subscription and YARN_COLORWAYS_API_KEY.':
   'Yarn Colorways API is unavailable.');
  error.status=response.status;throw error;
 }
 const body=await response.json();
 if(!Array.isArray(body?.data))throw Error('Colorways returned an invalid response');
 const items=body.data.slice(0,type==='catalog'?15000:500).map(row=>type==='catalog'?{
  brandId:short(row.brandId).slice(0,85),brandName:short(row.brandName).slice(0,120),
  yarnId:short(row.yarnId).slice(0,85),yarnName:short(row.yarnName).slice(0,160),
  yarnWeightId:short(row.yarnWeightId).slice(0,25),unavailable:!!row.unavailable
 }:{
  name:short(row.name).slice(0,160),
  hex:/^#[0-9a-f]{6}$/i.test(row.hex)?row.hex:'',
  yarnId:short(row.yarnId).slice(0,85),brandId:short(row.brandId).slice(0,85),
  unavailable:!!row.unavailable
 });
 return {items,total:Number(body.meta?.total)||body.data.length,provider:'temperature-blanket.com'};
}
Deno.serve(async request=>{
 const origin=request.headers.get('Origin')||'';
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(request.method!=='GET')return json({error:'Method not allowed'},405,origin);
 if(origin&&origin!==ORIGIN&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
  return json({error:'Origin forbidden'},403,origin);
 try{
  if(!DB||!ANON||!SERVICE)return json({error:'Yarn proxy configuration missing'},503,origin);
  if(!(await approved(request)))return json({error:'Please sign in to Sunbeam'},401,origin);
  if(!KEY)return json({error:'Yarn Colorways API secret is not configured'},503,origin);
  const url=new URL(request.url),type=url.searchParams.get('type');
  if(type!=='catalog'&&type!=='colors')return json({error:'Invalid lookup'},400,origin);
  const brand=(url.searchParams.get('brand')||'').toLowerCase();
  const yarn=(url.searchParams.get('yarn')||'').toLowerCase();
  if(type==='colors'&&(!/^[a-z0-9_-]{1,65}$/.test(brand)||
     !/^[a-z0-9_-]{1,65}$/.test(yarn)))return json({error:'Invalid yarn identifiers'},400,origin);
  const key=type==='catalog'?'colorways-v3:catalog':'colorways-v3:'+brand+':'+yarn;
  const ttl=type==='catalog'?14*86400000:30*86400000;
  const existing=await readCache(key);
  if(existing&&Date.now()-existing.at<ttl)
   return json({...existing.data,cache:'server'},200,origin);
  if(!pending.has(key))pending.set(key,(async()=>{
   const data=await upstream(type,brand,yarn);
   await writeCache(key,data);
   return data;
  })().finally(()=>pending.delete(key)));
  try{return json({...await pending.get(key),cache:'new'},200,origin)}
  catch(error){
   if(existing)return json({...existing.data,cache:'stale',
     warning:'Showing a previously saved yarn list'},200,origin);
   return json({error:String(error.message||'Cannot load yarns').slice(0,150)},
     error.status===429?429:502,origin);
  }
 }catch(error){return json({error:String(error.message||'Yarn search unavailable').slice(0,150)},502,origin)}
});