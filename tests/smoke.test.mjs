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
    setItem: (key, val) => values.set(key, val)
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
  assert.equal(catalog.length,5);
  assert.match(html,/Content-Security-Policy/);
  assert.doesNotMatch(html,/<script\s*>/i);
  assert.match(source('manifest.webmanifest'),/"display": "standalone"/);
  for(const file of ['js/app.js','js/storage.js','js/crypto.js','js/patterns.js',
    'js/estimates.js','js/guide-loader.js','js/views.js','js/previews.js','js/pwa.js',
    'css/base.css','css/components.css','css/theme.css','data/pattern-catalog.json']) {
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
test('sign out UI has been removed', () => {
 assert.doesNotMatch(source('js/app.js'),/data-action="sign-out"|case 'sign-out'|>Log out</);
});


test('all included projects have sensible planning estimates', () => {
  const window = {};
  runInNewContext(source('js/estimates.js'), {window});
  const estimate = window.SunbeamEstimates;
  const patterns = [
    'sambrosis-tooth','sweetpeaplush-baby-boba-bunny','huniebeecrafts-baby-appa',
    'oakandmarlow-brie-mouse','annie-carraway-cute-loaf-cat','donut-kitty'
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
  assert.equal(entries.length,5);
  assert.equal(fetched,1);
  assert.equal(inserted,0);
});


test('original photo sources are prioritized; vector illustration is never substituted', () => {
  const {window}=sandbox();
  runInNewContext(source('js/estimates.js'),{window});
  runInNewContext(source('js/previews.js'),{window,Image:function(){}});
  runInNewContext(source('js/views.js'),{window});
  const guide={id:'donut-kitty',title:'Donut Kitty',cover:'assets/donut-cover.svg',
    coverAsset:'assets/donut-cover.svg',
    groups:[{id:'body',title:'Body',steps:[{id:'first',title:'First',instruction:'Crochet'}]}],
    images:{finished:'data:image/jpeg;base64,AAAA'}};
  assert.equal(window.SunbeamPreviews.source(guide),'data:image/jpeg;base64,AAAA');
  const markup=window.SunbeamViews.library([{p:guide,pr:{},n:{percent:0},time:'5–9 hours'}],1);
  assert.ok(markup.includes('data:image/jpeg;base64,AAAA'));
  assert.ok(!markup.includes('donut-cover.svg'));
  const metadata={id:'demo',title:'Demo',coverAsset:'assets/tooth-cover.svg'};
  const noPhoto=window.SunbeamViews.library([{p:metadata,pr:{},n:{percent:0},time:null}],1);
  assert.match(noPhoto,/Loading photo/);
  assert.ok(!noPhoto.includes('tooth-cover.svg')&&!noPhoto.includes('🧶'));
});

test('Donut Kitty offers an explicit single-guide recovery without erasing progress', () => {
 const app=source('js/app.js');
 assert.match(app,/function showDonutRecovery/);
 assert.ok(app.includes('Donut-Kitty-Kimsi-Guide.json'));
 assert.ok(app.includes("restored.id!=='donut-kitty'"));
 assert.match(app,/persistProgress|loadProgress/);
 assert.match(app,/void populateRealCoverPhotos/);
 assert.doesNotMatch(app,/importPrivateGuide|import-guide|guide-import-file/);
});
