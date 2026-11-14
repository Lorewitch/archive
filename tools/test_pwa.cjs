// Run with Node.js 20+: no npm packages, servers or credentials required.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const scope = 'https://lorewitch.github.io/archive/';

function memoryCaches() {
  const stores = new Map();
  const keyOf = input => typeof input==='string' ? input : input.url;
  return {
    async open(name) {
      if (!stores.has(name)) stores.set(name,new Map());
      const store=stores.get(name);
      return {
        async put(key,value) {store.set(keyOf(key),value.clone());},
        async match(key) {return store.get(keyOf(key))?.clone();},
        async delete(key) {return store.delete(keyOf(key));},
        async keys() {return [...store.keys()].map(key=>new Request(key));},
      };
    },
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);},
  };
}
function fixture(network, options={}) {
  const handlers={}, caches=memoryCaches(), messages=[];
  let claims=0, skips=0;
  let fetcher=network || (async input=>{
    const url=new URL(typeof input==='string' ? input : input.url);
    const rel=url.pathname.slice(new URL(scope).pathname.length);
    const file=path.join(root,rel);
    if(!fs.existsSync(file))return new Response('missing',{status:404});
    return new Response(fs.readFileSync(file),{headers:{'content-type':rel.endsWith('.json') ? 'application/json':'text/plain'}});
  });
  const self={registration:{scope},clients:{async claim(){claims++;},async matchAll(){return [{postMessage:x=>messages.push(x)}];}},addEventListener:(name,fn)=>{handlers[name]=fn;},async skipWaiting(){skips++;}};
  const context=vm.createContext({self,caches,URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,console,fetch:(...args)=>fetcher(...args)});
  let workerSource=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  if(options.emptyCatalogs)workerSource=workerSource.replace(/^const EMPTY_CATALOGS = new Set\(.*\);$/m,'const EMPTY_CATALOGS = new Set('+JSON.stringify(options.emptyCatalogs)+');');
  vm.runInContext(workerSource+'\nthis.api={SHELL_CACHE,DATA_CACHE,IMAGE_CACHE,CACHE_PREFIX,APP_SHELL,DATA_LIMIT,IMAGE_LIMIT,saveResponse,cacheKey};',context);
  const api=context.api;
  async function lifecycle(name,data={}) {
    const tasks=[];handlers[name]({...data,waitUntil:p=>tasks.push(p)});
    await Promise.all(tasks);
  }
  async function request(rel,options={}) {
    let result;const tasks=[];
    const event={request:{url:new URL(rel,scope).href,method:options.method||'GET',mode:options.navigate?'navigate':'cors',headers:new Headers(options.headers)},waitUntil:p=>tasks.push(p),respondWith:p=>{result=p;}};
    handlers.fetch(event);
    if(result===undefined)return null;
    const response=await result;
    await Promise.all(tasks);
    return response;
  }
  return {api,caches,messages,request,lifecycle,setNetwork:fn=>{fetcher=fn;},get claims(){return claims;},get skips(){return skips;}};
}
const offline=async()=>{throw new TypeError('offline');};
const jsonResponse=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});

test('the manifest is portable under /archive/, with both regular and maskable install icons',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 assert.equal(manifest.display,'standalone');
 for(const field of ['id','start_url','scope'])assert.equal(new URL(manifest[field],scope).href,scope);
 for(const size of ['192x192','512x512'])assert.ok(manifest.icons.some(icon=>icon.sizes===size && icon.purpose==='any'));
 assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
 for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(root,icon.src)));
});

test('installation saves only the interface and counts; catalogs and all texts wait for visits',async()=>{
 const f=fixture();await f.lifecycle('install');
 assert.equal(f.skips,0);
 const keys=await (await f.caches.open(f.api.SHELL_CACHE)).keys();
 assert.ok(keys.some(key=>key.url===scope+'index.html'));
 assert.ok(keys.some(key=>key.url===scope+'data/archive_summary.json'));
 assert.ok(keys.every(key=>!key.url.includes('/data/') || key.url===scope+'data/archive_summary.json'));
 assert.ok(keys.every(key=>!key.url.includes('/bot_')));
 assert.ok(keys.every(key=>!key.url.includes('/data/books/')));
 const html=await f.request('./?from=shortcut',{navigate:true});assert.ok((await html.text()).includes('Архив Лороведьмы'));
});

test('a failed first install never replaces a usable older release',async()=>{
 const f=fixture(async()=>new Response('missing',{status:404}));
 const previous=f.api.CACHE_PREFIX+'shell:previous';await f.caches.open(previous);
 await assert.rejects(f.lifecycle('install'),/Cannot save/);
 assert.ok((await f.caches.keys()).includes(previous));
 assert.ok(!(await f.caches.keys()).includes(f.api.SHELL_CACHE));
});

test('an active release keeps HTML paired with its cached JS until the update is accepted',async()=>{
 const f=fixture();await f.lifecycle('install');
 f.setNetwork(async()=>new Response('<html>next release</html>'));
 const html=await (await f.request('./',{navigate:true})).text();
 assert.ok(html.includes('id="app"'));assert.ok(!html.includes('next release'));
});

test('saved text works offline across HTML cache-version changes, and fresh online text replaces it',async()=>{
 const f=fixture(async()=>jsonResponse({id:'book',text:'old'}));
 await f.request('data/books/book.json?v=781');
 f.setNetwork(offline);
 let saved=await f.request('data/books/book.json?v=999');
 assert.equal(saved.headers.get('X-Archive-Saved-Copy'),'1');assert.equal((await saved.json()).text,'old');
 f.setNetwork(async()=>jsonResponse({id:'book',text:'new'}));
 assert.equal((await (await f.request('data/books/book.json?v=999')).json()).text,'new');
 f.setNetwork(offline);
 assert.equal((await (await f.request('data/books/book.json')).json()).text,'new');
});

test('HTTP 500 falls back to saved text, while an unknown offline entry stays a distinct error',async()=>{
 const f=fixture(async()=>jsonResponse({id:'a'}));await f.request('data/books/a.json');
 f.setNetwork(async()=>new Response('server error',{status:500}));
 assert.equal((await f.request('data/books/a.json')).status,200);
 const unknown=await f.request('data/books/never-opened.json');
 assert.equal(unknown.status,503);assert.equal(unknown.headers.get('X-Archive-Offline-Miss'),'1');
 f.setNetwork(offline);
 assert.equal((await f.request('data/books/never-opened.json')).status,503);
});

test('an authoritative deletion removes both dynamic and precached catalog copies',async()=>{
 const f=fixture(async()=>jsonResponse([{id:'a'}]));await f.request('data/books_index.json');
 await (await f.caches.open(f.api.SHELL_CACHE)).put(scope+'data/books_index.json',jsonResponse([{id:'a'}]));
 f.setNetwork(async()=>new Response('deleted',{status:404}));
 assert.equal((await f.request('data/books_index.json')).status,404);
 f.setNetwork(offline);
 assert.equal((await f.request('data/books_index.json')).status,503);
});

test('malformed online JSON cannot poison a valid saved copy',async()=>{
 const f=fixture(async()=>jsonResponse({id:'a',text:'valid'}));await f.request('data/books/a.json');
 f.setNetwork(async()=>new Response('<html>not JSON</html>'));await f.request('data/books/a.json');
 f.setNetwork(offline);
 assert.equal((await (await f.request('data/books/a.json')).json()).text,'valid');
});

test('only known empty categories return an empty list offline',async()=>{
 const f=fixture(offline,{emptyCatalogs:['data/indexes/items/teyvat_resources.json']});
 assert.deepEqual(await (await f.request('data/indexes/items/teyvat_resources.json')).json(),[]);
 const populated=fixture(offline);
 assert.equal((await populated.request('data/indexes/items/teyvat_resources.json')).status,503);
 assert.equal((await f.request('data/indexes/items/not-a-category.json')).status,503);
});

test('offline page reload and deep links keep the archive shell, while other project scopes are untouched',async()=>{
 const f=fixture();await f.lifecycle('install');f.setNetwork(offline);
 const html=await f.request('./?source=shortcut',{navigate:true});assert.equal(html.status,200);assert.ok((await html.text()).includes('id="app"'));
 assert.equal(await f.request('https://lorewitch.github.io/game/',{navigate:true}),null);
 assert.equal(await f.request('https://example.com/data/books/a.json'),null);
 assert.equal(await f.request('data/bot_runtime_index.json'),null);
 assert.equal(await f.request('data/books/a.json',{method:'POST'}),null);
 assert.equal(await f.request('assets/icons/logo_menu_symbol.webp',{headers:{Range:'bytes=0-50'}}),null);
});

test('activation preserves saved texts, removes older catalogs, and retains unrelated application caches',async()=>{
 const f=fixture();const old=f.api.CACHE_PREFIX+'shell:old';await f.caches.open(old);await f.caches.open('another-application');
 const data=await f.caches.open(f.api.DATA_CACHE);
 await data.put(scope+'data/books/book.json',jsonResponse({id:'book'}));await data.put(scope+'data/books_index.json',jsonResponse([]));
 await f.lifecycle('activate');
 assert.equal(f.claims,1);assert.ok(!(await f.caches.keys()).includes(old));assert.ok((await f.caches.keys()).includes('another-application'));
 assert.ok(await data.match(scope+'data/books/book.json'));assert.equal(await data.match(scope+'data/books_index.json'),undefined);
});

test('first-visit warmup saves an opened text but rejects external, bot and source-file URLs',async()=>{
 const requested=[];const f=fixture(async input=>{requested.push(typeof input==='string'?input:input.url);return jsonResponse({id:'a'});});
 await f.lifecycle('message',{source:{url:scope},data:{type:'ARCHIVE_CACHE_VISITED',urls:[scope+'data/books/a.json?v=781','https://example.com/a.json',scope+'data/bot_runtime_index.json',scope+'src/js/anything.js']}});
 assert.deepEqual(requested,[scope+'data/books/a.json?v=781']);
 f.setNetwork(offline);assert.equal((await f.request('data/books/a.json')).status,200);
 await f.lifecycle('message',{source:{url:'https://example.com/'},data:{type:'ARCHIVE_SKIP_WAITING'}});assert.equal(f.skips,0);
 await f.lifecycle('message',{source:{url:scope},data:{type:'ARCHIVE_SKIP_WAITING'}});assert.equal(f.skips,1);
});

test('simultaneous cache writes keep the storage limit and evict the oldest records',async()=>{
 const f=fixture();await Promise.all(Array.from({length:25},(_,i)=>f.api.saveResponse(f.api.DATA_CACHE,scope+`data/books/${i}.json`,jsonResponse({id:i}),20)));
 const keys=await (await f.caches.open(f.api.DATA_CACHE)).keys();assert.equal(keys.length,20);assert.ok(keys.every(key=>!key.url.endsWith('/0.json')));
});

test('storage failures do not interrupt fresh online reading',async()=>{
 const f=fixture(async()=>jsonResponse({id:'a'}));const open=f.caches.open;
 f.caches.open=async()=>{throw new Error('QuotaExceededError');};
 assert.equal((await f.request('data/books/a.json')).status,200);
 assert.ok(f.messages.some(message=>message.type==='ARCHIVE_STORAGE_UNAVAILABLE'));
 f.caches.open=open;
});

async function uiFixture({installed=false,waiting=false,mobile=false}={}) {
 const events={},swEvents={},nodes={},posted=[];
 let prompts=0,reloads=0,closedMenus=0;
 function node(id) {
  if(!nodes[id])nodes[id]={hidden:true,disabled:false,textContent:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}};
  return nodes[id];
 }
 const worker={postMessage:value=>posted.push(value)};
 const registration={active:worker,waiting:waiting?worker:null,addEventListener(){},async update(){}};
 const media={matches:installed,addEventListener(){}};
 const navigator={onLine:true,userAgent:'Desktop browser',platform:'Linux',maxTouchPoints:0,serviceWorker:{controller:worker,ready:Promise.resolve(registration),addEventListener:(name,fn)=>swEvents[name]=fn,async register(url,options){assert.equal(url.href,scope+'sw.js');assert.equal(options.updateViaCache,'none');return registration;}}};
 const window={isSecureContext:true,location:{href:scope,reload(){reloads++;}},matchMedia:()=>media,addEventListener:(name,fn)=>events[name]=fn,setTimeout};
 const document={getElementById:node,addEventListener(){},visibilityState:'visible'};
 const context=vm.createContext({window,document,navigator,URL,performance:{getEntriesByType:()=>[]},console,mobileMenuMedia:{matches:mobile},closeMenu(){closedMenus++;},app:{querySelector(){return null;}},render(){},init(){}});
 let source=fs.readFileSync(path.join(root,'src/js/03-app/03-pwa.js'),'utf8').replace('initArchivePwa().catch(', 'this.boot=initArchivePwa().catch(');
 vm.runInContext(source,context);await context.boot;
 vm.runInContext('connectPwaControls()',context);
 return {nodes,events,swEvents,posted,navigator,remount(){for(const id of ['pwa-install','pwa-update','pwa-offline-hint','pwa-network-status'])delete nodes[id];vm.runInContext('connectPwaControls()',context);},get reloads(){return reloads;},get closedMenus(){return closedMenus;}};
}

test('native installation is offered only after a user clicks, and standalone windows hide the install button',async()=>{
 const f=await uiFixture();let prompts=0,prevented=false;
 const event={preventDefault(){prevented=true;},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})};
 f.events.beforeinstallprompt(event);
 assert.equal(prevented,true);assert.equal(prompts,0);assert.equal(f.nodes['pwa-install'].textContent,'Установить Архив');
 await f.nodes['pwa-install'].listeners.click();assert.equal(prompts,1);
 f.events.appinstalled();assert.equal(f.nodes['pwa-install'].hidden,true);
 const installed=await uiFixture({installed:true});assert.equal(installed.nodes['pwa-install'].hidden,true);
});

test('manual installation help closes the mobile menu before opening a focusable dialog',async()=>{
 const f=await uiFixture({mobile:true});
 await f.nodes['pwa-install'].listeners.click();
 assert.equal(f.closedMenus,1);assert.equal(f.nodes['pwa-install-dialog'].open,true);
 assert.ok(f.nodes['pwa-install-help'].textContent.includes('меню браузера'));
});

test('a fresh online response clears the saved-copy status after network recovery',async()=>{
 const f=await uiFixture();
 f.events['archive:saved-copy']();assert.equal(f.nodes['pwa-network-status'].hidden,false);
 f.events['archive:data-loaded']({detail:{url:scope+'data/books/a.json',savedCopy:false}});
 assert.equal(f.nodes['pwa-network-status'].hidden,true);
});

test('an available update never reloads reading until the user chooses it',async()=>{
 const f=await uiFixture({waiting:true});
 assert.equal(f.nodes['pwa-update'].hidden,false);assert.equal(f.reloads,0);
 f.swEvents.controllerchange();assert.equal(f.reloads,0);
 f.nodes['pwa-update'].listeners.click();
 assert.equal(f.posted.at(-1).type,'ARCHIVE_SKIP_WAITING');assert.equal(f.reloads,0);
 f.swEvents.controllerchange();assert.equal(f.reloads,1);
});

test('returning to About restores native installation, update and offline status',async()=>{
 const f=await uiFixture({waiting:true});
 f.events.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'dismissed'})});
 f.events['archive:saved-copy']();
 f.remount();
 assert.equal(f.nodes['pwa-install'].textContent,'Установить Архив');
 assert.equal(f.nodes['pwa-update'].hidden,false);
 assert.equal(f.nodes['pwa-network-status'].textContent,'Чтение сохранённой копии');
 assert.ok(f.nodes['pwa-offline-hint'].textContent.includes('Открытые разделы'));
 await f.nodes['pwa-install'].listeners.click();
});

test('conflicted online HTML cannot replace a usable offline release',async()=>{
 const f=fixture();await f.lifecycle('install');
 const old=f.api.CACHE_PREFIX+'shell:previous';await f.caches.open(old);
 f.setNetwork(async input=>{
  const url=typeof input==='string'?input:input.url;
  return new Response(url.includes('index.html') ? '<!doctype html>\n'+'<'.repeat(7)+' HEAD\n' : '{}');
 });
 await assert.rejects(f.lifecycle('install'),/unresolved Git conflict/);
 assert.ok((await f.caches.keys()).includes(old));
});


test('same-release versioned data is served from cache; a new version fetches fresh text',async()=>{
 const requests=[];let text='first';
 const f=fixture(async input=>{requests.push(typeof input==='string'?input:input.url);return jsonResponse({id:'a',text});});
 assert.equal((await (await f.request('data/readers/stories/a/stories.ru.json?v=800')).json()).text,'first');
 text='next';
 assert.equal((await (await f.request('data/readers/stories/a/stories.ru.json?v=800')).json()).text,'first');
 assert.equal(requests.length,1);
 assert.equal((await (await f.request('data/readers/stories/a/stories.ru.json?v=801')).json()).text,'next');
 assert.equal(requests.length,2);
 f.setNetwork(offline);
 const old=await f.request('data/readers/stories/a/stories.ru.json?v=802');
 assert.equal(old.headers.get('X-Archive-Saved-Copy'),'1');assert.equal((await old.json()).text,'next');
});

test('revisiting a same-release card image performs no background download',async()=>{
 let requests=0;
 const f=fixture(async()=>{requests++;return new Response('image',{headers:{'content-type':'image/webp'}});});
 await f.request('assets/icons/books/a.webp?v=800');
 await f.request('assets/icons/books/a.webp?v=800');
 assert.equal(requests,1);
});
