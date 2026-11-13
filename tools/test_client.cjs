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
function fixture(fetch = async () => { throw new Error('unexpected request'); }) {
  const node = () => ({innerHTML: '', setAttribute(){}, contains(){return false;}, querySelector(){return null;}});
  const app=node(), sidebar=node(), stage=node(), toTop=node();
  const document = {
    currentScript:null, activeElement:null,
    getElementById:id=>({app,sidebar,'to-top-button':toTop}[id] || node()),
    querySelector:selector=>selector==='.stage' ? stage : null,
    body:{classList:{contains:()=>false,remove(){}}}, documentElement:{classList:{remove(){}}},
  };
  const window = {location:{href:'https://lorewitch.github.io/archive/',hash:''},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame(){}};
  const context=vm.createContext({document,window,fetch,URL,Intl,console});
  vm.runInContext(modules.map(p=>fs.readFileSync(path.join(root,'src/js',p),'utf8')).join('\n') + `\nthis.api={state,parseHash,loadDetail,loadCatalogData,DETAILS,DETAIL_LOADS,renderBookDetail,itemMatchesFilter,getSectionConfig,escapeHtml,markdownToHtml,groupEntryCount,renderCatalogCard, get items(){return ITEMS;},setSummary(value){ARCHIVE_SUMMARY=value;}};`,context);
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
test('hover and click share one request; failed requests can be retried',async()=>{
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
