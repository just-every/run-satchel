// Project the selected acceptance rows and the clause register from CONTRACT.md.
// A scoped regeneration preserves other builders' existing acceptance sections.
import fs from 'node:fs';
import {parseContract} from '../src/base/seed-contract.mjs';

const [command,...args]=process.argv.slice(2);
if(!['write','check'].includes(command))throw Error('Use contract-docs.mjs write or check with --clauses ID,ID');
const option=args.indexOf('--clauses');
if(option<0||!args[option+1])throw Error('Name the clause IDs to regenerate with --clauses');
const selected=new Set(args[option+1].split(','));
let source=fs.readFileSync('CONTRACT.md','utf8');
// Summary rows are generated from the complete Status table, retaining every row.
const status=source.split('## Status')[1];
const rows=[...status.matchAll(/^\| `([^`]+)` \| ([^|]+) \| (published|target|push-further) \| (done|partial|missing) \|/gm)].map(m=>({id:m[1],kind:m[3],status:m[4]}));
const tally=xs=>[...['done','partial','missing'].map(s=>xs.filter(x=>x.status===s).length),xs.length];
const summaryRows=[];
for(const [label,own] of [['Published',rows.filter(r=>r.kind==='published')],['Target and push further',rows.filter(r=>r.kind!=='published')],['All',rows]])
 summaryRows.push('| '+label+' | '+tally(own).join(' | ')+' |');
// The entire summary is generated, including during a merge. Clause judgments
// remain solely in the Status rows; no side of a summary conflict is selected.
const summary=/^(\| Clauses \| Done \| Partial \| Missing \| Total \|\r?\n\|[^\n]*\r?\n)[\s\S]*?(?=\r?\n\r?\n)/m;
if(!summary.test(source))throw Error('Contract summary table missing');
source=source.replace(summary,(_whole,header)=>header+summaryRows.join('\n'));
const contract=parseContract(source);
for(const id of selected)if(!contract.clauses.some(c=>c.id===id))throw Error('Unknown clause '+id);
let acceptance=fs.readFileSync('ACCEPTANCE.md','utf8');
for(const c of contract.clauses.filter(c=>selected.has(c.id))){
 const marker='**Acceptance evidence:**',point=c.text.includes(marker)?c.text.slice(c.text.indexOf(marker)+marker.length).trim():c.text;
 const row=source.split('\n')[c.row-1],evidence=row.split('|')[5].trim();
 const line=`- **${c.id} — ${c.title}.** **Status: ${c.status}.** ${point} Current evidence: ${evidence}.${c.gap?' Gap: '+c.gap:''}`;
 const pattern=new RegExp('^- \\*\\*'+c.id+' —[^\\n]*','m');
 if(!pattern.test(acceptance))acceptance=acceptance.trimEnd()+'\n\n'+line+'\n';
 else acceptance=acceptance.replace(pattern,()=>line);
}
const claims='# Clause register\n\nGenerated from CONTRACT.md; regenerate with the documented contract-docs command. Acceptance requirements and status remain in that source.\n\n| Clause | Title | Status |\n| --- | --- | --- |\n'+contract.clauses.map(c=>`| ${c.id} | ${c.title} | ${c.status} |`).join('\n')+'\n';
const outputs=new Map([['CONTRACT.md',source],['ACCEPTANCE.md',acceptance],['docs/CLAIMS.md',claims]]);
for(const [path,contents] of outputs){if(command==='write')fs.writeFileSync(path,contents);else if(!fs.existsSync(path)||fs.readFileSync(path,'utf8')!==contents)throw Error('Stale contract projection: '+path);}
console.log('Contract projections '+(command==='check'?'checked':'written')+': '+[...selected].join(', '));
