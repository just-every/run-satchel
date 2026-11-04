import assert from 'node:assert/strict';

const text=html=>html.replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[v])).trim();
/** Read what the static page actually publishes, independently of its generator. */
export function readAgentReference(html){
 const tables=[...html.matchAll(/<table><thead><tr>(.*?)<\/tr><\/thead><tbody>(.*?)<\/tbody><\/table>/gs)].map(([,head,body])=>({
  headers:[...head.matchAll(/<th>(.*?)<\/th>/gs)].map(m=>text(m[1])),
  rows:[...body.matchAll(/<tr>(.*?)<\/tr>/gs)].map(m=>[...m[1].matchAll(/<td>(.*?)<\/td>/gs)].map(v=>text(v[1]))),
 }));
 const rows=header=>{const table=tables.find(t=>t.headers.includes(header));assert.ok(table,'Published reference table: '+header);return table.rows;};
 const tools=rows('Tool').map(([title,name,scope,readOnly,classes])=>({title,name,scope,readOnly:readOnly==='Yes',classes:classes.split(', ')}));
 const fixtures=rows('Fixture call').map(([id,tool,expected])=>({id,tool,expect:expected.split('; ').map(item=>{const i=item.indexOf(' ');return {class:item.slice(0,i),facts:JSON.parse(item.slice(i+1))};})}));
 const publicRows=rows('Public surface'),resource=publicRows.find(row=>row[0]==='Resource templates');
 assert.ok(resource,'Public resource templates are disclosed');
 const templates=resource[1].startsWith('None.')?[]:resource[1].split(', ');
 return {tools,fixtures,templates,publicRows};
}
export function assertFixtureReference(guide,surface){
 assert.deepEqual(guide.fixtures,surface.journey.filter(step=>step.expect.some(item=>item.class!=='standard')).map(({id,tool,expect})=>({id,tool,expect})),'Published computed-class fixtures match the independent declaration');
}
export function assertRuntimeReference(guide,listed,templates){
 const order=items=>items.toSorted((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(order(guide.tools),order(listed.map(tool=>({title:tool.title,name:tool.name,scope:tool._meta['com.runeditrun/scope'],readOnly:tool.annotations.readOnlyHint,classes:tool._meta['com.runeditrun/classes']}))),'Published jobs, names, scopes, classes and read-only behavior match authenticated MCP');
 assert.deepEqual(guide.templates.toSorted(),templates.map(item=>item.uriTemplate).sort(),'Published templates match authenticated MCP');
}
