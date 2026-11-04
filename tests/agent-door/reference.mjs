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
 const fixtures=rows('Fixture call').map(([id,tool,expected])=>{
  const detail=html.split('<h3 id="fixture-'+id+'">')[1]?.split('<h')[0];
  assert.ok(detail,'Published fixture call '+id);
  const code=detail.match(/<pre><code>(.*?)<\/code><\/pre>/s);
  assert.ok(code,'Published fixture arguments '+id);
  return {id,tool,args:JSON.parse(text(code[1])),expect:expected.split('; ').map(item=>{const i=item.indexOf(' ');return {class:item.slice(0,i),facts:JSON.parse(item.slice(i+1))};})};
 });
 const publicRows=rows('Public surface'),resource=publicRows.find(row=>row[0]==='Resource templates');
 assert.ok(resource,'Public resource templates are disclosed');
 const templates=resource[1].startsWith('None.')?[]:resource[1].split(', ');
 const families=rows('Capability family');
 const capabilities={declared:families.filter(row=>row[1]==='Declared').map(row=>row[0]),refused:families.filter(row=>row[1]==='Undeclared and refused').map(row=>row[0])};
 return {tools,fixtures,templates,publicRows,capabilities};
}
export function assertFixtureReference(guide,surface){
 assert.deepEqual(guide.fixtures,surface.journey.filter(step=>step.expect.some(item=>item.class!=='standard')).map(({id,tool,args,expect})=>({id,tool,args,expect})),'Published computed-class fixtures and executable arguments match the independent declaration');
}
export function assertRuntimeReference(guide,listed,templates,capabilities){
 const order=items=>items.toSorted((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(order(guide.tools),order(listed.map(tool=>({title:tool.title,name:tool.name,scope:tool._meta['com.runeditrun/scope'],readOnly:tool.annotations.readOnlyHint,classes:tool._meta['com.runeditrun/classes']}))),'Published jobs, names, scopes, classes and read-only behavior match authenticated MCP');
 assert.deepEqual(guide.templates.toSorted(),templates.map(item=>item.uriTemplate).sort(),'Published templates match authenticated MCP');
 assert.deepEqual(guide.capabilities,{declared:capabilities.declared,refused:capabilities.refused},'Published capability families match live discovery');
}
