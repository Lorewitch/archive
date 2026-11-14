// Dependency-free regression tests for reading, filters and Alter's deep links.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const modules = [
  '00-core/00-data-store.js', '00-core/01-taxonomies-and-filters.js',
  '00-core/02-section-config.js', '00-core/03-ui-state-and-dom.js',
  '00-core/04-text-and-scroll-utils.js', '01-render/00-common-renderers.js',
  '02-routing/00-navigation-and-router.js', '01-render/01-catalog-renderer.js',
  '01-render/02-detail-renderers.js',
];
function fixture(fetch = async () => { throw new Error('unexpected request'); }, controller = false) {
  const node = () => ({innerHTML: '', setAttribute(){}, contains(){return false;}, querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}});
  const app=node(), sidebar=node(), stage=node(), toTop=node();
  const document = {
    currentScript:null, activeElement:null,
    getElementById:id=>({app,sidebar,'to-top-button':toTop}[id] || node()),
    querySelector:selector=>selector==='.stage' ? stage : null,
    body:{classList:{contains:()=>false,remove(){}}}, documentElement:{classList:{remove(){}}},
  };
  const window = {location:{href:'https://lorewitch.github.io/archive/',hash:''},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame(){},addEventListener(){}};
  const context=vm.createContext({document,window,fetch,URL,Intl,console,requestAnimationFrame(){}});
  const loaded = controller ? [...modules,'03-app/00-event-handlers.js','03-app/01-render-controller.js'] : modules;
  vm.runInContext(loaded.map(p=>fs.readFileSync(path.join(root,'src/js',p),'utf8')).join('\n') + `\nthis.api={state,parseHash,loadDetail,loadCatalogData,DETAILS,DETAIL_LOADS,renderBookDetail,itemMatchesFilter,getSectionConfig,escapeHtml,markdownToHtml,groupEntryCount,renderCatalogCard,fetchJson,fetchOptionalJson,worldCatalogUnits,worldQuestSeriesOrder, loadStoryReaderChunk,storyReaderChunkLoaded,renderQuestRelations,archonCollectionFor,get items(){return ITEMS;},setSummary(value){ARCHIVE_SUMMARY=value;}};`,context);
  if(controller)vm.runInContext(`
    renderNav=()=>{};markRouteRendered=()=>{};syncCustomScrollbarsSoon=()=>{};
    preserveScrollRender=fn=>fn();
    renderStoryDetail=(story)=>{activeDetail={type:'story',data:story,configId:'stories'};app.innerHTML=story.parts[0].text[state.lang]||'';};
    Object.assign(api,{render,rerenderActiveDetailPreservingScroll,getActiveDetail:()=>activeDetail});
  `,context);
  return {api:context.api,app,window};
}
const json = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('every Alter deep link resolves to its original section, group and entry',()=>{
  const {api,window}=fixture();
  for(const entry of json('data/bot_runtime_index.json').entries){
    window.location.hash=entry.route;api.parseHash();
    assert.equal(api.state.section,entry.section,entry.key);
    assert.equal(api.state.entryId,entry.id,entry.key);
    const detail=json(`data/${entry.section}/${entry.id}.json`);
    if(['items','stories'].includes(entry.section))assert.equal(api.state.subsection,detail.item_group||detail.story_group,entry.key);
  }
  window.location.hash='#/stories/quest_stories/quest_aq_1001';api.parseHash();
  assert.equal(api.state.entryId,'quest_aq_1001');
});
test('opening a different book with fewer volumes displays its first volume',()=>{
  const {api,app}=fixture();api.state.volume=7;
  api.renderBookDetail({id:'short',title:{ru:'Книга'},volumes:[{number:1,title:{ru:'Первый том'},text:{ru:'Текст первого тома'}},{number:2,title:{ru:'Второй том'},text:{ru:'Текст второго тома'}}]});
  assert.equal(api.state.volume,1);assert.ok(app.innerHTML.includes('Текст первого тома'));
});
test('duplicate detail requests share one request; failed requests can be retried',async()=>{
  let requests=0, fail=true;
  const {api}=fixture(async()=>{requests++;if(fail)throw new Error('offline');return {ok:true,json:async()=>({id:'a'})};});
  await assert.rejects(api.loadDetail('books','a'),/offline/);
  assert.equal(api.DETAIL_LOADS.size,0);fail=false;
  const [a,b]=await Promise.all([api.loadDetail('books','a'),api.loadDetail('books','a')]);
  assert.equal(a,b);assert.equal(requests,2);
  await api.loadDetail('books','a');assert.equal(requests,2);
});
test('the reading cache stays bounded after a long browsing session',async()=>{
  const {api}=fixture(async url=>({ok:true,json:async()=>({id:url})}));
  for(let i=0;i<35;i++)await api.loadDetail('books',String(i));
  assert.equal(api.DETAILS.size,24);assert.equal(api.DETAIL_LOADS.size,0);
});
test('a late catalog response cannot replace the newly selected category',async()=>{
  const pending={};const {api}=fixture(url=>new Promise(resolve=>{pending[url]=resolve;}));
  const config=api.getSectionConfig('items');api.state.section='items';api.state.subsection='common_enemies';
  const first=api.loadCatalogData(config);
  api.state.subsection='teyvat_resources';const second=api.loadCatalogData(config);
  pending['data/indexes/items/teyvat_resources.json']({ok:true,json:async()=>[{id:'new'}]});await second;
  pending['data/indexes/items/common_enemies.json']({ok:true,json:async()=>[{id:'old'}]});await first;
  assert.equal(api.items[0].id,'new');
});
test('character specialty filters and combined weapon filters return matching entries',()=>{
  const {api}=fixture();const config=api.getSectionConfig('stories');api.state.section='stories';api.state.subsection='character_stories';
  const rows=json('data/indexes/stories/character_stories.json');
  for(const type of ['witchcraft','star_blade','lunar_omen']){
    const matches=rows.filter(item=>api.itemMatchesFilter(item,config,'all',new Set([`trait:${type}`])));
    const expected=rows.filter(item=>item.character_filters.includes(type));
    assert.ok(matches.length>0 && matches.length<rows.length,type);
    assert.deepEqual(matches.map(x=>x.id),expected.map(x=>x.id),type);

  }
  const weapons=api.getSectionConfig('weapons');
  assert.equal(api.itemMatchesFilter({rarity:5,weapon_type:'sword'},weapons,'all',new Set(['rarity:5','weapon:sword'])),true);
  assert.equal(api.itemMatchesFilter({rarity:4,weapon_type:'sword'},weapons,'all',new Set(['rarity:5','weapon:sword'])),false);
});
test('category counts are available before visiting any category',()=>{
  const {api}=fixture();api.setSummary(json('data/archive_summary.json'));
  assert.equal(api.groupEntryCount(api.getSectionConfig('stories'),'character_stories'),json('data/indexes/stories/character_stories.json').length);
  assert.ok(api.groupEntryCount(api.getSectionConfig('items'),'common_enemies')>0);
});
test('game text is escaped before Markdown formatting',()=>{
  const {api}=fixture();const html=api.markdownToHtml('**Имя:** <img src=x onerror=alert(1)>');
  assert.ok(html.includes('<strong>Имя:</strong>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});

test('offline misses are distinguishable from genuinely empty optional categories',async()=>{
  const {api}=fixture(async()=>({ok:false,status:503,headers:new Headers({'X-Archive-Offline-Miss':'1'})}));
  await assert.rejects(api.fetchOptionalJson('data/indexes/items/anything.json'),/ещё не сохранён/);
  const {api:empty}=fixture(async()=>({ok:false,status:404}));
  assert.equal((await empty.fetchOptionalJson('data/indexes/items/empty.json')).length,0);
});

test('world series preserve every retained quest and place the Tsaritsa orders chronologically',()=>{
 const {api}=fixture();api.state.section='stories';api.state.subsection='world_quests';
 const rows=json('data/indexes/stories/world_quests.json');
 const units=api.worldCatalogUnits(rows,api.getSectionConfig('stories'));
 const allIds=units.flatMap(unit=>unit.kind==='series' ? Array.from(unit.entries,q=>q.id) : [unit.item.id]);
 assert.equal(new Set(allIds).size,209);assert.equal(allIds.length,209);
 assert.equal(units.filter(unit=>unit.kind==='series').length,29);
 const orders=units.find(unit=>unit.kind==='series' && unit.title==='Тайные приказы ледяного дворца');
 assert.equal(orders.entries.length,12);
 assert.equal(orders.entries[0].id,'quest_wq_77664');
 assert.equal(orders.entries[5].id,'quest_wq_77669');
 assert.equal(orders.entries[11].id,'quest_wq_77686');
});

test('independent quest links do not override explicit series order or hide a single search match',()=>{
 const {api}=fixture();api.state.section='stories';api.state.subsection='world_quests';
 const first={id:'first',story_group:'world_quests',quest_series:['shared'],quest_series_ru:'Серия',quest_series_order:10,quest_chain:['first']};
 const second={id:'second',story_group:'world_quests',quest_series:['shared'],quest_series_ru:'Серия',quest_series_order:20,quest_chain:['second']};
 const config=api.getSectionConfig('stories');
 const grouped=api.worldCatalogUnits([second,first],config);
 assert.deepEqual(Array.from(grouped[0].entries,q=>q.id),['first','second']);
 const filtered=api.worldCatalogUnits([second],config);
 assert.equal(filtered.length,1);assert.equal(filtered[0].kind,'entry');assert.equal(filtered[0].item.id,'second');
});


test('opening a catalog requests only its lightweight rows and no hidden detail bodies',async()=>{
  const requested=[];
  const {api}=fixture(async url=>{requested.push(url);return {ok:true,json:async()=>json(url)}});
  api.state.section='stories';api.state.subsection='character_stories';
  const rows=await api.loadCatalogData(api.getSectionConfig('stories'));
  assert.deepEqual(requested,['data/indexes/stories/character_stories.json']);
  assert.ok(rows.every(row=>!row.parts && !row.replicas && !row.text && !row.description));
});

test('a story deep link loads only its manifest and active language; replicas wait for their tab',async()=>{
  const requested=[];
  const {api}=fixture(async url=>{requested.push(url);return {ok:true,json:async()=>json(url)}});
  const story=await api.loadDetail('stories','alyosha');
  assert.deepEqual(requested,['data/readers/stories/alyosha.json']);
  assert.ok(story.parts.every(part=>!part.text));assert.ok(story.replicas.every(part=>!part.text));
  await Promise.all([api.loadStoryReaderChunk(story,'stories','ru'),api.loadStoryReaderChunk(story,'stories','ru')]);
  assert.deepEqual(requested,['data/readers/stories/alyosha.json','data/readers/stories/alyosha/stories.ru.json']);
  assert.ok(story.parts[0].text.ru.includes('В Снежной имя'));
  assert.equal(story.parts[0].text.en,undefined);assert.ok(story.replicas.every(part=>!part.text));
  await api.loadStoryReaderChunk(story,'replicas','en');
  assert.equal(requested.at(-1),'data/readers/stories/alyosha/replicas.en.json');
  assert.ok(story.replicas.every(part=>typeof part.text.en==='string'));
  await api.loadStoryReaderChunk(story,'stories','ru');assert.equal(requested.length,3);
});

test('a failed story language request can be retried without poisoning the saved text',async()=>{
  let fail=true,requests=0;
  const {api}=fixture(async url=>{requests++;if(fail)throw Error('offline');return {ok:true,json:async()=>json(url)}});
  const story=json('data/readers/stories/alyosha.json');
  await assert.rejects(api.loadStoryReaderChunk(story,'stories','ru'),/offline/);
  assert.ok(story.parts.every(part=>!part.text));
  fail=false;await api.loadStoryReaderChunk(story,'stories','ru');assert.equal(requests,2);
});

test('direct quest navigation has all related titles without fetching another catalog',()=>{
  const {api}=fixture();
  const all=json('data/stories_index.json');
  for(const row of all.filter(row=>row.story_group==='archon_quests')){
    const story=json(`data/readers/stories/${row.id}.json`);
    const expected=all.filter(item=>item.story_group==='archon_quests' && api.archonCollectionFor(item)===api.archonCollectionFor(row)).map(x=>x.id).sort();
    assert.deepEqual(story.quest_reference_rows.map(x=>x.id).sort(),expected,row.id);
  }
  const story=json('data/readers/stories/quest_wq_77664.json');
  const html=api.renderQuestRelations(story);
  assert.equal((html.match(/class="quest-chain-link/g)||[]).length,12);
  assert.ok(html.includes('quest_wq_77686'));
});


test('the route controller opens a direct story link without loading any catalog',async()=>{
 const requested=[];
 const f=fixture(async url=>{requested.push(url);return {ok:true,json:async()=>json(url)}},true);
 f.window.location.hash='#/stories/character_stories/alyosha';
 await f.api.render();
 assert.deepEqual(requested,['data/readers/stories/alyosha.json','data/readers/stories/alyosha/stories.ru.json']);
 assert.ok(f.app.innerHTML.includes('В Снежной имя'));
});

test('a delayed story language cannot replace a later language selection',async()=>{
 const pending={};
 const f=fixture(async url=>{
   if(url.endsWith('/stories.en.json')||url.endsWith('/stories.zh.json'))await new Promise(resolve=>pending[url]=resolve);
   return {ok:true,json:async()=>json(url)};
 },true);
 f.window.location.hash='#/stories/character_stories/alyosha';await f.api.render();
 f.api.state.lang='en';const english=f.api.rerenderActiveDetailPreservingScroll();
 f.api.state.lang='zh';const chinese=f.api.rerenderActiveDetailPreservingScroll();
 pending['data/readers/stories/alyosha/stories.zh.json']();await chinese;
 const latest=f.app.innerHTML;
 pending['data/readers/stories/alyosha/stories.en.json']();await english;
 assert.equal(f.app.innerHTML,latest);
 assert.ok(latest.includes(json('data/stories/alyosha.json').parts[0].text.zh.slice(0,30)));
});
