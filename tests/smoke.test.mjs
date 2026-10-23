/* Run: node --test tests/smoke.test.mjs (Node 20+; no dependencies). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
});

test('all local scripts/styles are cached and inline JavaScript stays disabled', () => {
  const html = source('index.html');
  const sw = source('service-worker.js');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script\s*>/i);
  for (const file of [
    'js/app.js','js/storage.js','js/crypto.js','js/patterns.js','js/estimates.js','js/pwa.js',
    'css/base.css','css/components.css','css/theme.css',
    ...Array.from({length:23},(_,i) => 'data/encrypted/appa/part-' + String(i+1).padStart(2,'0') + '.js'),
    'data/encrypted/appa/loader.js',
    ...Array.from({length:22},(_,i) => 'data/encrypted/brie/part-' + String(i+1).padStart(2,'0') + '.js'),
    'data/encrypted/brie/loader.js',
    ...Array.from({length:34},(_,i)=>'data/encrypted/loaf/part-'+String(i+1).padStart(2,'0')+'.js'),
    'data/encrypted/loaf/loader.js'
  ]) {
    assert.ok(html.includes(file), file + ' missing from HTML');
    assert.ok(sw.includes(file), file + ' missing from cache');
  }
  assert.match(source('manifest.webmanifest'), /"display": "standalone"/);
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
    assert.match(estimate.estimateTime({id}), /^\\d+–\\d+ hours$/);
  }
  assert.equal(estimate.estimateTime({id:'annie-carraway-cute-loaf-cat'}, {variantOption:'solid'}), '2–4 hours');
  assert.equal(estimate.estimateTime({id:'annie-carraway-cute-loaf-cat'}, {variantOption:'spotted'}), '3–5 hours');
  assert.equal(estimate.estimateTime({id:'unfamiliar-guide'}), null);
});

test('time estimates and requested navigation copy display consistently', () => {
  const html = source('index.html');
  const app = source('js/app.js');
  const css = source('css/components.css');
  assert.match(html, /id="i-clock"/);
  assert.ok(html.indexOf('js/estimates.js?') < html.indexOf('js/app.js?'));
  assert.match(app, /pattern-time/);
  assert.match(app, /guide-time/);
  assert.match(app, /Find your next project or continue where you left off\./);
  assert.match(app, /Back to patterns/);
  assert.match(app, /<strong>Sections<\/strong>/);
  assert.doesNotMatch(app, /Your sunny journey|Back to the pattern garden|A growing garden of lovely little handmade friends/);
  assert.match(css, /\.pattern-time/);
  assert.match(css, /\.guide-time/);
});
