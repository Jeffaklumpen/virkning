/* Run: node --test tests/smoke.test.mjs (Node 20+; no dependencies). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

function fakeIndexedDB() {
  const databases = new Map();
  const api = {
    open(name) {
      const req = {};
      queueMicrotask(() => {
        let db = databases.get(name);
        const upgraded = !db;
        if (!db) {
          const stores = new Map();
          db = {
            stores,
            objectStoreNames: {contains: key => stores.has(key)},
            createObjectStore(key) { stores.set(key, new Map()); },
            transaction(key) {
              const tx = {oncomplete: null, onerror: null};
              const execute = callback => {
                const request = {};
                queueMicrotask(() => {
                  try {
                    request.result = callback();
                    request.onsuccess?.();
                    queueMicrotask(() => tx.oncomplete?.());
                  } catch (error) {
                    request.error = error;
                    request.onerror?.();
                    tx.onerror?.();
                  }
                });
                return request;
              };
              tx.objectStore = () => ({
                getAll: () => execute(() => [...stores.get(key).values()]),
                getAllKeys: () => execute(() => [...stores.get(key).keys()]),
                get: id => execute(() => stores.get(key).get(id)),
                put: (value, id) => execute(() => stores.get(key).set(id ?? value.id, value)),
                delete: id => execute(() => stores.get(key).delete(id))
              });
              return tx;
            },
            close() {}
          };
          databases.set(name, db);
        }
        req.result = db;
        if (upgraded) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    records(name, store) { return databases.get(name).stores.get(store); }
  };
  return api;
}

function sandbox() {
  const indexedDB = fakeIndexedDB();
  const values = new Map();
  const localStorage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, val) => values.set(key, String(val)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() {return values.size}
  };
  const window = {DecompressionStream: globalThis.DecompressionStream};
  const context = {
    window, indexedDB, localStorage, crypto: webcrypto, atob, btoa,
    TextEncoder, TextDecoder, Uint8Array, Blob, Response
  };
  for (const file of ['js/storage.js', 'js/crypto.js', 'js/patterns.js']) {
    runInNewContext(source(file), context, {filename: file});
  }
  return {window, indexedDB, localStorage};
}

test('patterns calculate completion and reject unsafe images', () => {
  const {window} = sandbox();
  const p = {id:'sample',title:'Sample',groups:[{id:'body',title:'Body',steps:[{id:'1'}, {id:'2',option:'1'}, {id:'3',option:'2'}]}]};
  const utils = window.SunbeamPatterns;
  assert.equal(utils.validPattern(p), true);
  assert.equal(utils.stepsFor(p, {earOption:'1'}).length, 2);
  assert.equal(utils.stats(p, {earOption:'2',done:{'1':true}}).percent, 50);
  assert.equal(utils.safeImage('javascript:alert(1)'), '');
  assert.equal(utils.esc('<img>'), '&lt;img&gt;');
});

test('guide encryption, legacy migration, progress and sign-out preserve data safely', async () => {
  const {window, indexedDB} = sandbox();
  const store = window.SunbeamStorage;
  const key = await webcrypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
  store.setGuideKey(key);
  const pattern = {id:'test-guide',title:'Sensitive pattern',groups:[{id:'body',steps:[]}]};
  await store.storeGuide(pattern);
  const records = indexedDB.records('kimsi-cozy-guides-v1', 'guides');
  assert.equal(records.get('test-guide').title, undefined);
  assert.ok(records.get('test-guide').ciphertext);
  assert.equal((await store.getAllGuides())[0].title, pattern.title);
  records.set('legacy', {id:'legacy',title:'Previously local',groups:[]});
  const guides = await store.getAllGuides();
  assert.equal(guides.length, 2);
  assert.deepEqual(await store.listStoredIds(), ['test-guide','legacy']);
  assert.equal((await store.getGuide('test-guide')).title,'Sensitive pattern');
  assert.ok(records.get('legacy').ciphertext);
  assert.equal(records.get('legacy').title, undefined);
  const progress = {...store.baseProgress(),done:{'first':true}};
  store.persistProgress('test-guide', progress);
  assert.equal(store.loadProgress('test-guide').done.first, true);
  await store.rememberAuthKey(key);
  assert.ok(await store.savedAuthKey());
  await store.forgetAuthKey();
  assert.equal(await store.savedAuthKey(), null);
  store.setGuideKey(null);
  await assert.rejects(store.getAllGuides());
  assert.equal(store.loadProgress('test-guide').done.first, true);
  store.setGuideKey(key);
  const image='data:image/webp;base64,AAAA';
  await store.storePreview('test-guide',image);
  assert.equal((await store.getPreviews())['test-guide'],image);
  assert.ok(indexedDB.records('sunbeam-art-previews-v1','previews').get('test-guide').ciphertext);
});

test('fast shell, on-demand encrypted assets and catalogue match', () => {
  const html=source('index.html');
  const sw=source('service-worker.js');
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  assert.equal(catalog.length,12);
  assert.match(html,/Content-Security-Policy/);
  assert.doesNotMatch(html,/<script\s*>/i);
  assert.match(source('manifest.webmanifest'),/"display": "standalone"/);
  for(const file of ['js/app.js','js/storage.js','js/crypto.js','js/patterns.js',
    'js/estimates.js','js/guide-loader.js','js/views.js','js/overview.js','js/previews.js','js/motion.js','js/pwa.js',
    'css/base.css','css/components.css','css/theme.css','css/motion.css','data/pattern-catalog.json']) {
    assert.ok(html.includes(file)||file.endsWith('.json'),file+' missing from HTML');
    assert.ok(sw.includes(file),file+' missing from offline shell');
  }
  const ids=new Set();
  for(const guide of catalog) {
    assert.ok(!ids.has(guide.id),'duplicate guide '+guide.id);
    ids.add(guide.id);
    assert.ok(guide.assets.length>0);
    for(const path of guide.assets) {
      assert.ok(existsSync(new URL('../'+path,import.meta.url)),path+' not found');
      assert.ok(!html.includes(path),path+' should be lazy');
      assert.ok(!sw.includes(path),path+' should not precache');
    }
  }
  assert.match(source('js/guide-loader.js'),/script\.async=false/);
  assert.match(source('js/app.js'),/SunbeamGuides\.load/);
});

test('manual private-pattern import interface and handlers are absent', () => {
  const html = source('index.html');
  const app = source('js/app.js');
  assert.doesNotMatch(html, /guide-import-file/);
  assert.doesNotMatch(app, /importPrivateGuide|import-guide|guide-import-file|Import private pattern/);
});


test('variant-specific steps preserve separate completion', () => {
 const {window}=sandbox();
 const guide={id:'cat',title:'Cat',groups:[{id:'both',steps:[{id:'choose'},{id:'solid',variant:'solid'},{id:'spotted',variant:'spotted'}]}]};
 const rules=window.SunbeamPatterns;
 assert.deepEqual(rules.stepsFor(guide,{earOption:'2',variantOption:'solid'}).map(x=>x.id),['choose','solid']);
 assert.deepEqual(rules.stepsFor(guide,{earOption:'2',variantOption:'spotted'}).map(x=>x.id),['choose','spotted']);
 assert.equal(rules.stats(guide,{earOption:'2',variantOption:'spotted',done:{solid:true}}).complete,0);
 assert.equal(rules.stats(guide,{earOption:'2',variantOption:'solid',done:{solid:true}}).complete,1);
});
test('Supabase login replaces the old pattern-only login and sign-out is accessible', () => {
 const app=source('js/app.js'),views=source('js/views.js'),cloud=source('js/cloud.js');
 assert.match(views,/id="sunbeam-email"/);
 assert.match(views,/id="sunbeam-password"/);
 assert.doesNotMatch(views,/sunbeam-setup-form|sunbeam-legacy-password|Finish secure setup/);
 assert.doesNotMatch(app,/renderSetup\(|finishSetup\(|pendingAccountPassword|pendingMember|keyring\.enroll\(/);
 assert.match(views,/data-action="sign-out"/);
 assert.doesNotMatch(views,/Connect cloud backup|cloud-strip/);
 assert.match(app,/case 'sign-out':void signOut/);
 assert.match(app,/cloud\.login\(email,password\)/);
 assert.match(app,/cloud\.readKeyring\(\)/);
 assert.match(app,/if\(!envelope\)\{/);
 assert.match(app,/await keyring\.unlock\(envelope,password,member\.user_id\)/);
 assert.match(app,/cloud\.requireFreshLogin\(\)/);
 assert.match(app,/await forgetAuthKey\(\)/);
 assert.doesNotMatch(app,/savedAuthKey\(\)|rememberAuthKey\(/);
 assert.match(cloud,/localStorage\.removeItem\(STORE\)/);
 assert.doesNotMatch(cloud,/localStorage\.setItem\(STORE/);
});


test('all included projects have sensible planning estimates', () => {
  const window = {};
  runInNewContext(source('js/estimates.js'), {window});
  const estimate = window.SunbeamEstimates;
  const patterns = [
    'sambrosis-tooth','sweetpeaplush-baby-boba-bunny','huniebeecrafts-baby-appa',
    'oakandmarlow-brie-mouse','annie-carraway-cute-loaf-cat',
    'snugglebeans-baby-night-dragon-sploot'
  ];
  for (const id of patterns) {
    const range = estimate.estimateFor({id}, {variantOption:'solid'});
    assert.ok(range && range.min >= 1 && range.max > range.min, id);
    assert.match(estimate.estimateTime({id}), /^[0-9]+–[0-9]+ hours$/);
  }
  assert.equal(estimate.estimateTime({id:'annie-carraway-cute-loaf-cat'}, {variantOption:'solid'}), '2–4 hours');
  assert.equal(estimate.estimateTime({id:'annie-carraway-cute-loaf-cat'}, {variantOption:'spotted'}), '3–5 hours');
  assert.equal(estimate.estimateTime({id:'unfamiliar-guide'}), null);
});

test('time estimates and requested navigation copy display consistently', () => {
  const html = source('index.html');
  const app = source('js/app.js');
  const view = source('js/views.js');
  const css = source('css/components.css');
  assert.match(html, /id="i-clock"/);
  assert.ok(html.indexOf('js/estimates.js?') < html.indexOf('js/app.js?'));
  assert.match(view, /pattern-time/);
  assert.match(view, /guide-time/);
  assert.match(view, /Find your next project or continue where you left off\./);
  assert.match(view, /Back to patterns/);
  assert.match(view, /<strong>Sections<\/strong>/);
  assert.doesNotMatch(view, /Your sunny journey|Back to the pattern garden|A growing garden of lovely little handmade friends/);
  assert.match(css, /\.pattern-time/);
  assert.match(css, /\.guide-time/);
});

test('library presentation works with catalogue entries before decrypting guides', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window},{filename:'js/estimates.js'});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}},{filename:'js/previews.js'});
  runInNewContext(source('js/views.js'),{window},{filename:'js/views.js'});
  const meta={id:'huniebeecrafts-baby-appa',title:'Baby Appa',designer:'Huniebeecrafts'};
  const html=window.SunbeamViews.library([{p:meta,pr:{},n:{percent:0},time:'12–18 hours'}],1);
  assert.match(html,/Baby Appa/);
  assert.match(html,/12–18 hours/);
  assert.match(html,/pattern-thumb-placeholder/);
  const previewHtml=window.SunbeamViews.library([{p:{...meta,preview:'data:image/webp;base64,AAAA'},pr:{},n:{percent:0},time:null}],1);
  assert.ok(previewHtml.includes('data:image/webp;base64,AAAA'));
  const guide={...meta,groups:[{id:'body',title:'Body',steps:[{id:'first',title:'First',instruction:'Single crochet'}]}]};
  const state={done:{},materials:{},earOption:'2',variantOption:'solid'};
  const markup=window.SunbeamViews.guide(guide,state,'body','first',
    {...guide.groups[0].steps[0],groupId:'body',groupTitle:'Body'},
    [{...guide.groups[0].steps[0],groupId:'body',groupTitle:'Body'}],
    {percent:0,complete:0,total:1},0);
  assert.match(markup,/Single crochet/);
  assert.match(markup,/Back to patterns/);
});

test('login can display an unloaded pattern catalogue without fetching encrypted payloads', async () => {
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  const window={};
  let fetched=0, inserted=0;
  const fetch=async url=>{
    fetched++;
    assert.equal(url,'./data/pattern-catalog.json');
    return {ok:true,json:async()=>catalog};
  };
  const document={createElement(){inserted++;return {};},head:{appendChild(){}}};
  runInNewContext(source('js/guide-loader.js'),{window,fetch,document,Map,Set,Promise});
  const entries=await window.SunbeamGuides.catalog();
  assert.equal(entries.length,12);
  assert.equal(fetched,1);
  assert.equal(inserted,0);
});


test('original photo sources are prioritized; vector illustration is never substituted', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/views.js'),{window});
  const guide={id:'sambrosis-tooth',title:'Little Tooth',cover:'assets/tooth-cover.svg',
    coverAsset:'assets/tooth-cover.svg',
    groups:[{id:'body',title:'Body',steps:[{id:'first',title:'First',instruction:'Crochet'}]}],
    images:{finished:'data:image/jpeg;base64,AAAA'}};
  assert.equal(window.SunbeamPreviews.source(guide),'data:image/jpeg;base64,AAAA');
  const markup=window.SunbeamViews.library([{p:guide,pr:{},n:{percent:0},time:'5–9 hours'}],1);
  assert.ok(markup.includes('data:image/jpeg;base64,AAAA'));
  assert.ok(!markup.includes('tooth-cover.svg'));
  const metadata={id:'demo',title:'Demo',coverAsset:'assets/tooth-cover.svg'};
  const noPhoto=window.SunbeamViews.library([{p:metadata,pr:{},n:{percent:0},time:null}],1);
  assert.match(noPhoto,/Loading photo/);
  assert.ok(!noPhoto.includes('tooth-cover.svg')&&!noPhoto.includes('🧶'));
});


test('retired guide is absent from the current app, catalogue, assets and PWA cache', () => {
  const app=source('js/app.js');
  const worker=source('service-worker.js');
  const catalogue=JSON.parse(source('data/pattern-catalog.json'));
  assert.equal(catalogue.length,12);
  assert.equal(catalogue.some(entry=>entry.id==='donut-kitty'),false);
  assert.equal(source('js/estimates.js').includes("'donut-kitty':"),false);
  assert.equal(worker.includes('donut-cover.svg'),false);
  assert.equal(app.includes('showDonutRecovery'),false);
  assert.equal(app.includes('donut-repair-file'),false);
  assert.ok(app.includes("id!=='donut-kitty'")); // Hide existing local record, don't delete it.
  for(const path of [
    'assets/donut-body.svg','assets/donut-color.svg','assets/donut-cover.svg',
    'assets/donut-ears.svg','assets/donut-face.svg','assets/donut-sprinkles.svg',
    'assets/donut-tail.svg'
  ]) assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
});

test('guide rendering handles materials, ear choice and style choice without a crash', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/views.js'),{window});
  const choices=[
    {id:'prep-materials',title:'Materials',expected:'yarn and hook'},
    {id:'ear-choice',title:'Ear method',expected:'Option 2'},
    {id:'choose-style',title:'Choose a style',expected:'Spotted'}
  ];
  const guide={
    id:'test-project',title:'Test project',
    groups:[{id:'basics',title:'Getting started',steps:choices}],
    materials:[{name:'yarn and hook'}],
    variants:[{id:'solid',title:'Solid'},{id:'spotted',title:'Spotted'}]
  };
  const progress={done:{},materials:{0:true},earOption:'2',variantOption:'solid'};
  const all=choices.map(step=>({...step,groupId:'basics',groupTitle:'Getting started'}));
  for (const step of all){
    const html=window.SunbeamViews.guide(guide,progress,'basics',step.id,step,
      all,{total:3,complete:0,percent:0},all.findIndex(x=>x.id===step.id));
    assert.ok(html.includes(choices.find(x=>x.id===step.id).expected),step.id);
  }
});


test('overview displays every selected step and keeps progress unchanged', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/overview.js'),{window});
  const state={done:{first:true,solid:true},earOption:'2',variantOption:'solid'};
  const guide={
    id:'annie-carraway-cute-loaf-cat',title:'Cute Loaf Cat Plushies',
    designer:'Annie Carraway Art',images:{
      cover:'data:image/jpeg;base64,AAAA',main:'data:image/png;base64,BBBB',
      side:'data:image/jpeg;base64,CCCC'
    },cover:'cover',variants:[{id:'solid',title:'Solid Color'},{id:'spotted',title:'Spotted'}],
    groups:[
      {id:'setup',title:'Getting started',steps:[
        {id:'first',title:'Prepare materials',instruction:'Prepare your yarn.',image:'main',images:['main','side'],tip:'Use the correct hook.'},
        {id:'solid',title:'Solid body',instruction:'Crochet solid.',variant:'solid',raw:'6sc',count:6},
        {id:'spotted',title:'Spotted body',instruction:'Crochet spotted.',variant:'spotted'}]},
      {id:'final',title:'Finish',steps:[{id:'end',title:'Last stitches',instruction:'Finish off.',warning:'Do not overfill.'}]}
    ]
  };
  const before=JSON.stringify(state);
  const html=window.SunbeamOverview.render(guide,state,'solid');
  assert.equal(JSON.stringify(state),before,'Overview should never change completion or selected option');
  assert.match(html,/Pattern overview/);
  assert.match(html,/Getting started/);
  assert.match(html,/Last stitches/);
  assert.match(html,/Crochet solid\./);
  assert.doesNotMatch(html,/Crochet spotted\./);
  assert.match(html,/2\/3/);
  assert.match(html,/67%/);
  assert.match(html,/Style: Solid Color/);
  assert.match(html,/data-action="overview-section" data-id="setup"/);
  assert.match(html,/id="overview-group-setup"/);
  assert.match(html,/data-action="step" data-id="solid"/);
  assert.match(html,/data-action="back-to-guide"/);
  assert.match(html,/data-action="zoom" data-key="side"/);
  assert.equal((html.match(/data-action="zoom" data-key="main"/g)||[]).length,1,'Duplicate step photo should not be repeated');
  assert.match(html,/loading="lazy" decoding="async"/);
  assert.match(html,/Do not overfill/);
  assert.match(html,/6sc/);
  assert.match(html,/6 stitches/);
  assert.match(html,/✓ Done/);
  state.variantOption='spotted';
  const alternative=window.SunbeamOverview.render(guide,state,'first');
  assert.match(alternative,/Crochet spotted\./);
  assert.doesNotMatch(alternative,/Crochet solid\./);
  assert.match(alternative,/Style: Spotted/);
});

test('overview renders options and materials while escaping unsafe pattern text', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/overview.js'),{window});
  const guide={
    id:'example',title:'My <strong>project</strong>',
    images:{},materials:[{name:'Soft yarn',detail:'Size 6'}],
    variants:[{id:'solid',title:'Solid'},{id:'spotted',title:'Spotted'}],
    groups:[{id:'first',title:'First section',steps:[
      {id:'prep-materials',title:'Materials',instruction:'Gather <script>alert(1)</script>'},
      {id:'choose-style',title:'Choose a style',instruction:'Choose your style.'},
      {id:'ear-choice',title:'Ear options',instruction:'Choose ear placement.'},
      {id:'hidden-ear',title:'For option 1',instruction:'Hidden',option:'1'},
      {id:'selected-ear',title:'For option 2',instruction:'Visible',option:'2'}
    ]}]
  };
  const progress={done:{},materials:{0:true},earOption:'2',variantOption:'spotted'};
  const markup=window.SunbeamOverview.render(guide,progress,'prep-materials');
  assert.match(markup,/Soft yarn/);
  assert.match(markup,/Size 6/);
  assert.match(markup,/Spotted/);
  assert.match(markup,/Ears: Option 2/);
  assert.match(markup,/Current ear method:/);
  assert.match(markup,/Visible/);
  assert.doesNotMatch(markup,/Hidden/);
  assert.match(markup,/My &lt;strong&gt;project&lt;\/strong&gt;/);
  assert.match(markup,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<script>alert/);
});

test('long guides can be scanned in a single overview and wired from guide mode', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/overview.js'),{window});
  const groups=Array.from({length:9},(_,g)=>({
    id:'group-'+g,title:'Section '+(g+1),
    steps:Array.from({length:8},(_,s)=>({id:'step-'+g+'-'+s,title:'Row '+(g*8+s+1),
      instruction:'Complete row '+(g*8+s+1)+'.'}))
  }));
  const html=window.SunbeamOverview.render({id:'big-guide',title:'Big guide',groups}, {done:{}}, 'step-0-0');
  assert.equal((html.match(/class="overview-step /g)||[]).length,72);
  assert.equal((html.match(/class="overview-section"/g)||[]).length,9);
  assert.match(html,/Complete row 72\./);
  const app=source('js/app.js');
  const view=source('js/views.js');
  const page=source('index.html');
  const worker=source('service-worker.js');
  assert.match(view,/data-action="overview"/);
  assert.match(app,/function renderOverview\(\)/);
  assert.match(app,/case 'overview':renderOverview\(\)/);
  assert.match(app,/case 'back-to-guide':returnToGuide\(\)/);
  assert.match(app,/case 'overview-section'/);
  assert.match(app,/if\(overviewOpen\|\|!activeId/);
  assert.ok(page.includes('js/overview.js?v=easter-v1'));
  assert.ok(page.includes('css/overview.css?v=overview-v2'));
  assert.ok(page.indexOf('js/overview.js?')<page.indexOf('js/app.js?'));
  assert.ok(worker.includes('./js/overview.js'));
  assert.ok(worker.includes('./css/overview.css'));
  assert.match(source('css/overview.css'),/@media\(max-width:700px\)/);
  assert.match(source('css/overview.css'),/position:sticky/);
});

test('the library uses small encrypted covers instead of bulk background guide downloads', () => {
  const app=source('js/app.js');
  const crypto=source('js/crypto.js');
  const sw=source('service-worker.js');
  const covers=JSON.parse(source('data/encrypted/cover-previews.json'));
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  assert.equal(covers.version,1);
  assert.equal(Object.keys(covers.covers).length,catalog.length);
  assert.ok(Buffer.byteLength(JSON.stringify(covers))<460000,'covers must stay lightweight');
  for(const guide of catalog){
    const cover=covers.covers[guide.id];
    assert.ok(cover && typeof cover.iv==='string' && typeof cover.ciphertext==='string',guide.id);
    assert.ok(cover.ciphertext.length>100);
    assert.doesNotMatch(JSON.stringify(cover),/data:image|crochet pattern|stitch instructions/i);
  }
  assert.match(app,/void populateEncryptedCoverPhotos\(\)/);
  assert.doesNotMatch(app,/populateRealCoverPhotos/);
  assert.match(app,/SunbeamCrypto\.decryptCover/);
  assert.match(crypto,/sunbeam-cover:/);
  assert.match(sw,/data\/encrypted\/cover-previews\.json/);
  assert.doesNotMatch(sw,/part-01\.js/);
});

test('cover AES-GCM decrypts only with matching guide ID and trusted image data', async () => {
  const {window}=sandbox();
  const key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const id='test-guide';
  const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const src='data:image/webp;base64,AAAA';
  const aad=new TextEncoder().encode('sunbeam-cover:'+id+':v1');
  const ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(src));
  const sealed={iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(ciphertext).toString('base64')};
  assert.equal(await window.SunbeamCrypto.decryptCover(sealed,id,key),src);
  await assert.rejects(window.SunbeamCrypto.decryptCover(sealed,'other-guide',key));
  const untrusted=await webcrypto.subtle.encrypt(
    {name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode('javascript:alert(1)'));
  await assert.rejects(window.SunbeamCrypto.decryptCover({
    iv:sealed.iv,ciphertext:Buffer.from(untrusted).toString('base64')
  },id,key));
});

test('Donut Kitty has protected guide assets and a separately encrypted cover', () => {
  const entries=JSON.parse(source('data/pattern-catalog.json'));
  const donut=entries.find(entry=>entry.id==='thewhimsywhale-donut-kitty');
  assert.ok(donut && donut.assets.length > 1);
  assert.ok(donut.assets.every(path=>path.startsWith('data/encrypted/donut/')));
  assert.match(source(donut.assets.at(-1)),/wrappedSessionKey/);
  assert.ok(JSON.parse(source('data/encrypted/cover-previews.json')).covers[donut.id].wrappedSessionKey);
  assert.match(source('service-worker.js'),/config\/donut-envelope\.json/);
});

test('overview back-to-top button is accessible, scroll-aware and works on iPad', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/overview.js'),{window});
  const guide={id:'test-pattern',title:'A long pattern',groups:[{id:'first',title:'Start',steps:[{id:'one',title:'Step one',instruction:'Crochet.'}]}]};
  const markup=window.SunbeamOverview.render(guide,{done:{}},'one');
  assert.match(markup,/<button[^>]+class="overview-to-top"[^>]+data-action="overview-top"[^>]+hidden>/);
  assert.match(markup,/aria-label="Scroll to the top of the pattern overview"/);
  assert.match(markup,/Back to top/);
  const app=source('js/app.js'),css=source('css/overview.css');
  assert.match(app,/window.addEventListener\('scroll',updateOverviewTopButton,\{passive:true\}\)/);
  assert.match(app,/button.hidden=window.scrollY<480/);
  assert.match(app,/case 'overview-top':if\(overviewOpen\)window.scrollTo/);
  assert.match(app,/prefers-reduced-motion: reduce/);
  assert.match(css,/\.overview-to-top\[hidden\]\{display:none\}/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(source('index.html'),/js\/app.js\?v=remembered-session-v1/);
  assert.match(source('service-worker.js'),/sunbeam-art-offline-v30/);
});

test('screen transitions preserve immediate rendering and guide-step controls', () => {
  const win={matchMedia:()=>({matches:false}),scrollTo:()=>{win.scrolled=(win.scrolled||0)+1}};
  const doc={documentElement:{dataset:{}}};
  runInNewContext(source('js/motion.js'),{window:win,document:doc,Promise});
  const animations=[];
  const panel={animate:(frames,settings)=>{
    animations.push({target:'panel',frames,settings});
    return {cancel(){}};
  }};
  const shell={
    innerHTML:'',dataset:{},
    animate:(frames,settings)=>{
      animations.push({target:'shell',frames,settings});
      return {cancel(){}};
    },
    querySelector:(selector)=>selector==='.step-panel'?panel:null
  };
  let attached=0;
  win.SunbeamMotion.render(shell,'<section>Login</section>','login',{afterMount:()=>attached++});
  assert.equal(shell.innerHTML,'<section>Login</section>');
  assert.equal(attached,1);
  win.SunbeamMotion.render(shell,'<section>Shelf</section>','library');
  assert.equal(shell.dataset.motionView,'library');
  win.SunbeamMotion.render(shell,'<section>Step 1</section>','guide');
  win.SunbeamMotion.render(shell,'<section>Step 2</section>','guide',{direction:'back'});
  assert.equal(shell.innerHTML,'<section>Step 2</section>');
  assert.equal(animations.at(-1).target,'panel');
  assert.match(animations.at(-1).frames[0].transform,/translate3d\(-13px/);
  assert.equal(win.scrolled,4);
});

test('native page crossfades are optional and reduced motion disables animation', () => {
  const doc={documentElement:{dataset:{}},startViewTransition(update){
    update();
    return {finished:Promise.resolve(),skipTransition(){}};
  }};
  let animateCalls=0;
  const shell={dataset:{motionView:'guide'},innerHTML:'',
    animate(){animateCalls++;return {cancel(){}};},querySelector(){return null;}};
  const win={matchMedia:()=>({matches:false}),scrollTo(){}};
  runInNewContext(source('js/motion.js'),{window:win,document:doc,Promise});
  win.SunbeamMotion.render(shell,'Overview content','overview');
  assert.equal(shell.innerHTML,'Overview content');
  assert.equal(animateCalls,0,'native crossfade replaces fallback animation');
  const reducedWin={matchMedia:()=>({matches:true}),scrollTo(){}};
  runInNewContext(source('js/motion.js'),{window:reducedWin,document:doc,Promise});
  shell.dataset.motionView='overview';
  reducedWin.SunbeamMotion.render(shell,'Guide content','guide');
  assert.equal(shell.innerHTML,'Guide content');
  assert.equal(animateCalls,0,'reduced motion skips all animations');
});

test('all screens load accessible lightweight motion assets without changing private content', () => {
  const html=source('index.html'),app=source('js/app.js');
  const css=source('css/motion.css'),sw=source('service-worker.js');
  assert.ok(html.includes('js/motion.js?v=motion-v1'));
  assert.ok(html.includes('css/motion.css?v=motion-v1'));
  assert.ok(html.indexOf('js/motion.js?')<html.indexOf('js/app.js?'));
  assert.match(app,/swapView\(el,window.SunbeamViews.login/);
  assert.match(app,/swapView\(el,window.SunbeamViews.library/);
  assert.match(app,/swapView\(el,window.SunbeamViews.guide/);
  assert.match(app,/swapView\(el,window.SunbeamOverview.render/);
  assert.match(app,/swapView\(el,window.SunbeamViews.finished/);
  assert.match(app,/swapView\(el,'<section class="library-empty"/);
  assert.match(css,/::view-transition-old\(sunbeam-page\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.dialog-backdrop/);
  assert.match(sw,/sunbeam-art-offline-v30/);
  assert.match(sw,/\.\/js\/motion\.js/);
  assert.match(sw,/\.\/css\/motion\.css/);
});

test('Easter Bunny Bundle adds a fully encrypted, 43-page three-project guide', () => {
  const entries=JSON.parse(source('data/pattern-catalog.json'));
  const easter=entries.find(entry=>entry.id==='krochet-by-kris-easter-bunny-bundle');
  assert.ok(easter && easter.revision===1);
  assert.equal(entries.length,12);
  assert.equal(easter.assets.length,12);
  assert.ok(easter.assets.every(path=>path.startsWith('data/encrypted/easter/')));
  assert.ok(source(easter.assets.at(-1)).includes('gzip+aes-256-gcm'));
  const bundle=JSON.parse(source('data/encrypted/cover-previews.json'));
  assert.ok(bundle.covers[easter.id].ciphertext);
  assert.ok(source('js/estimates.js').includes(easter.id));
  assert.match(source('js/views.js'),/easter-p02/);
  assert.match(source('js/overview.js'),/easter-p02/);
});


test('Plush Mermaid Mod ships encrypted with original photos and three independent variations', () => {
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  const mermaid=catalog.find(item=>item.id==='oakandmarlow-plush-mermaid-mod');
  assert.equal(catalog.length,12);
  assert.ok(mermaid,'Mermaid Mod is missing');
  assert.equal(mermaid.revision,1);
  assert.equal(mermaid.assets.length,17);
  assert.ok(mermaid.assets.every(path=>path.startsWith('data/encrypted/mermaid/')));
  for(const path of mermaid.assets) assert.ok(existsSync(new URL('../'+path,import.meta.url)));
  assert.match(source(mermaid.assets.at(-1)),/gzip\+aes-256-gcm/);
  assert.doesNotMatch(source(mermaid.assets.at(-1)),/4 sc in mc|Yarn needle/);
  const covers=JSON.parse(source('data/encrypted/cover-previews.json'));
  assert.ok(covers.covers[mermaid.id]?.ciphertext);
  assert.match(source('js/estimates.js'),/oakandmarlow-plush-mermaid-mod/);
  assert.match(source('js/app.js'),/guide\.variants\.some/);
  const {window}=sandbox();
  const mod={id:'mermaid',title:'Mermaid',groups:[{id:'variation',steps:[
    {id:'shared'},{id:'shell',variant:'shell'},{id:'high-waist',variant:'high-waist'},{id:'tankini',variant:'tankini'}]}]};
  const forStyle=id=>window.SunbeamPatterns.stepsFor(mod,{earOption:'2',variantOption:id}).map(s=>s.id);
  assert.deepEqual(forStyle('shell'),['shared','shell']);
  assert.deepEqual(forStyle('high-waist'),['shared','high-waist']);
  assert.deepEqual(forStyle('tankini'),['shared','tankini']);
});


test('Pooh Snuggler integrates encrypted original pages and catalogue metadata', () => {
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  const pooh=catalog.find(entry=>entry.id==='frauskau-pooh-snuggler');
  assert.ok(pooh && pooh.revision===1);
  assert.equal(catalog.length,12);
  assert.equal(pooh.assets.length,13);
  assert.ok(pooh.assets.every(path=>path.startsWith('data/encrypted/pooh/')));
  for(const path of pooh.assets) assert.ok(existsSync(new URL('../'+path,import.meta.url)));
  const loader=source(pooh.assets.at(-1));
  assert.ok(loader.includes('gzip+aes-256-gcm'));
  assert.match(loader,/keySource.*login/);
  assert.doesNotMatch(loader,/Rnd 1:|Make 2 in mustard|crochet hook 6\\.00/);
  const covers=JSON.parse(source('data/encrypted/cover-previews.json'));
  assert.ok(covers.covers[pooh.id]?.ciphertext);
  assert.ok(source('js/estimates.js').includes(pooh.id));
  assert.ok(source('index.html').includes('js/estimates.js?v=dragon-v1'));
});

test('Luna the Druid has protected assets, a cover and a time estimate', () => {
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  const luna=catalog.find(entry=>entry.id==='mrsgeegees-luna-the-druid');
  assert.ok(luna && luna.revision===1);
  assert.equal(luna.assets.length,34);
  for(const path of luna.assets){
    assert.ok(path.startsWith('data/encrypted/luna/'));
    assert.ok(existsSync(new URL('../'+path,import.meta.url)));
  }
  assert.ok(source(luna.assets.at(-1)).includes('gzip+aes-256-gcm'));
  assert.ok(JSON.parse(source('data/encrypted/cover-previews.json')).covers[luna.id]?.ciphertext);
  assert.ok(source('js/estimates.js').includes(luna.id));
  assert.ok(source('index.html').includes('js/estimates.js?v=dragon-v1'));
});

test('Baby Night Dragon Sploot is protected and has selectable styles', () => {
  const catalog=JSON.parse(source('data/pattern-catalog.json'));
  const dragon=catalog.find(e=>e.id==='snugglebeans-baby-night-dragon-sploot');
  assert.ok(dragon && dragon.revision===1);
  assert.equal(dragon.assets.length,13);
  for(const path of dragon.assets){
    assert.ok(path.startsWith('data/encrypted/dragon/'));
    assert.ok(existsSync(new URL('../'+path,import.meta.url)),path);
  }
  const loader=source(dragon.assets.at(-1));
  assert.ok(loader.includes('gzip+aes-256-gcm'));
  assert.ok(loader.includes('"keySource":"login"'));
  assert.doesNotMatch(loader,/Rnd1:|Premier Parfait Chunky/);
  const covers=JSON.parse(source('data/encrypted/cover-previews.json'));
  assert.ok(covers.covers[dragon.id]?.ciphertext);
  const window={};
  runInNewContext(source('js/estimates.js'),{window});
  assert.equal(window.SunbeamEstimates.estimateTime({id:dragon.id}), '7–12 hours');
  assert.ok(source('index.html').includes('js/estimates.js?v=dragon-v1'));
});

test('Teacup Frog ships protected original-page references and cover', () => {
  const entries=JSON.parse(source('data/pattern-catalog.json'));
  const frog=entries.find(entry=>entry.id==='hekleguriane-teacup-frog');
  assert.ok(frog);
  assert.equal(frog.title,'Teacup Frog');
  assert.equal(frog.designer,'@hekleguriane.bamser');
  assert.equal(frog.assets.length,7);
  assert.ok(frog.assets.every(path=>path.startsWith('data/encrypted/teacup/') && existsSync(new URL('../'+path,import.meta.url))));
  const loader=source('data/encrypted/teacup/loader.js');
  assert.ok(loader.includes('gzip+aes-256-gcm'));
  assert.ok(loader.includes('keySource'));
  const covers=JSON.parse(source('data/encrypted/cover-previews.json'));
  assert.ok(covers.covers[frog.id]?.iv && covers.covers[frog.id]?.ciphertext);
  const window={};
  runInNewContext(source('js/estimates.js'),{window});
  assert.equal(window.SunbeamEstimates.estimateFor(frog).min,3);
  assert.equal(window.SunbeamEstimates.estimateFor(frog).max,5);
});


test('Kimsi legacy progress migrates once, and future accounts stay isolated', () => {
  const {window}=sandbox();
  const store=window.SunbeamStorage;
  const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  store.persistProgress('little-tooth',{done:{round1:true},updatedAt:'2026-10-25T10:00:00Z'});
  store.setProgressUser(owner,true);
  assert.equal(store.loadProgress('little-tooth').done.round1,true);
  assert.equal(store.getProgressRecord('little-tooth').dirty,'bootstrap');
  // An existing cloud copy wins over a one-time, unsynced legacy import.
  store.applyCloudProgress('little-tooth',{done:{round2:true},updatedAt:'2026-10-26T10:00:00Z'});
  assert.equal(store.loadProgress('little-tooth').done.round1,undefined);
  assert.equal(store.loadProgress('little-tooth').done.round2,true);
  assert.equal(store.getProgressRecord('little-tooth').dirty,null);
  store.persistProgress('little-tooth',{done:{round3:true}});
  const first=store.getProgressRecord('little-tooth').dirty;
  assert.ok(first.startsWith('local:'));
  store.persistProgress('little-tooth',{done:{round4:true}});
  store.markProgressSynced('little-tooth',first);
  assert.notEqual(store.getProgressRecord('little-tooth').dirty,null,
    'an older in-flight save must not clear a new pending edit');
  store.markProgressSynced('little-tooth',store.getProgressRecord('little-tooth').dirty);
  assert.equal(store.getProgressRecord('little-tooth').dirty,null);
  store.setProgressUser(other,false);
  assert.equal(store.getProgressRecord('little-tooth').present,false);
  store.setProgressUser(null);
  assert.equal(store.loadProgress('little-tooth').done.round1,true);
});

test('Supabase integration uses a publishable key, scoped RLS and offline-first progress', () => {
  const html=source('index.html');
  const sw=source('service-worker.js');
  const cfg=source('config/supabase-config.js');
  const cloud=source('js/cloud.js');
  const app=source('js/app.js');
  const storage=source('js/storage.js');
  assert.match(cfg,/sb_publishable_/);
  assert.doesNotMatch(cfg,/service_role|sb_secret_/);
  assert.match(html,/connect-src 'self' https:\/\/ksmgnigwknzfargzjfzm\.supabase\.co/);
  for(const file of ['config/supabase-config.js','js/cloud.js']){
    assert.ok(html.includes(file),file+' must load in the app');
    assert.ok(sw.includes(file),file+' must work when offline');
  }
  assert.match(cloud,/sunbeam_members/);
  assert.match(cloud,/sunbeam_progress/);
  assert.match(cloud,/resolution=merge-duplicates/);
  assert.match(app,/cloud\.schedule\(activeId\)/);
  assert.match(storage,/setProgressUser/);
  assert.match(source('js/keyring.js'),/PBKDF2/);
  assert.match(source('js/cloud.js'),/sunbeam_keyrings/);
  assert.match(source('js/views.js'),/Sign in to my hive/);
});


test('approved account encryption migration safely wraps the old guide key', async () => {
 const window={};
 const context={window,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,atob,btoa};
 const bytes=Uint8Array.from({length:16},(_,i)=>i+1);
 const base64=data=>btoa(String.fromCharCode(...data));
 const oldPassword='test-only-original-password';
 const accountPassword='test-only-new-account-password';
 const uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const salt=webcrypto.getRandomValues(new Uint8Array(16));
 const iv=webcrypto.getRandomValues(new Uint8Array(12));
 const input=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(oldPassword),'PBKDF2',false,['deriveKey']);
 const oldKey=await webcrypto.subtle.deriveKey({
   name:'PBKDF2',salt,iterations:1000,hash:'SHA-256'
 },input,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const wrapped=await webcrypto.subtle.encrypt({
   name:'AES-GCM',iv,additionalData:new TextEncoder().encode('sunbeam-art-auth-v1')
 },oldKey,bytes);
 window.SUNBEAM_AUTH_CONFIG={salt:base64(salt),iterations:1000,iv:base64(iv),wrappedKey:base64(new Uint8Array(wrapped))};
 runInNewContext(source('js/crypto.js'),context);
 runInNewContext(source('js/keyring.js'),context);
 const escrow=window.SunbeamKeyring;
 await assert.rejects(escrow.enroll(accountPassword,'incorrect-old-password',uuid));
 const original=await escrow.enroll(accountPassword,oldPassword,uuid);
 assert.equal(original.envelope.version,'1');
 assert.ok(original.envelope.ciphertext);
 assert.doesNotMatch(JSON.stringify(original.envelope),/test-only-original-password|test-only-new-account-password/);
 const unlocked=await escrow.unlock(original.envelope,accountPassword,uuid);
 await window.SunbeamCrypto.unwrapPrivatePatternKey(unlocked);
 await assert.rejects(escrow.unlock(original.envelope,'wrong-account-password',uuid));
 await assert.rejects(escrow.unlock(original.envelope,accountPassword,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
});


test('pattern notes are personal, safely rendered, and included in synced progress', () => {
  const {window}=sandbox();
  const store=window.SunbeamStorage;
  const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const id='sambrosis-tooth';
  store.setProgressUser(account,false);
  const notes='Yarn: cotton, hook 4 mm\nChanged ears\n</textarea><script>alert(1)</script>';
  const progress={...store.baseProgress(),done:{first:true},materials:{wool:true},notes};
  store.persistProgress(id,progress);
  const local=store.getProgressRecord(id);
  assert.equal(local.progress.notes,notes);
  assert.equal(local.progress.done.first,true);
  assert.equal(local.progress.materials.wool,true);
  assert.ok(local.dirty.startsWith('local:'));
  assert.equal(JSON.parse(JSON.stringify(local.progress)).notes,notes,
    'a note must be part of the same JSON object uploaded to Supabase');

  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/views.js'),{window});
  const step={id:'first',title:'First step',groupTitle:'Body',groupId:'body',instruction:'Crochet'};
  const pattern={id,title:'Little Tooth',designer:'Example',groups:[{id:'body',title:'Body',steps:[step]}]};
  const guide=window.SunbeamViews.guide(pattern,store.loadProgress(id),'body','first',step,
    [step],{total:1,complete:1,percent:100},0);
  assert.match(guide,/id="pattern-notes-input"/);
  assert.match(guide,/Yarn: cotton, hook 4 mm/);
  assert.match(guide,/&lt;\/textarea&gt;/);
  assert.doesNotMatch(guide,/<script>alert\(1\)<\/script>/);
  assert.match(guide,/My pattern notes/);
  assert.match(guide,/maxlength="5000"/);
  assert.match(source('js/app.js'),/addEventListener\('input'/);
  assert.match(source('js/app.js'),/progress\.notes=value;persist\(\)/);
  assert.match(source('js/storage.js'),/notes: ''/);

  store.markProgressSynced(id,local.dirty);
  assert.equal(store.getProgressRecord(id).dirty,null);
  store.setProgressUser(other,false);
  assert.equal(store.loadProgress(id).notes,'','notes must not leak into a second account');
});

test('the upper-right decorative sparkle is removed without touching the bee', () => {
  const css=source('css/theme.css');
  assert.match(css,/\.hero::before\s*\{\s*content:none;\s*display:none/);
  assert.match(css,/\.hero-bee\s*\{/);
});
