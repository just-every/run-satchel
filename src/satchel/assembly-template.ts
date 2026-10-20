import {insist,text,type Data} from './model';
import {definition,typedValue,blank,type FieldDefinition} from './matter-types';
export type Paragraph={text:string;when?:{key:string;equals:string|number|boolean};repeat?:'parties'};
export type Template={jurisdiction:string;formVersion:string;questions:FieldDefinition[];paragraphs:Paragraph[]};
export function templateDefinition(raw:unknown):Template {
 insist(raw&&typeof raw==='object'&&!Array.isArray(raw),'Supply a template');const d=raw as Data;
 const questions=definition({required:[],records:[],fields:d.questions}).fields;
 insist(Array.isArray(d.paragraphs)&&d.paragraphs.length>0&&d.paragraphs.length<=100,'Supply 1–100 paragraphs');
 const paragraphs=d.paragraphs.map((p:Data)=>{
  insist(p&&typeof p==='object','Supply a paragraph');const result:Paragraph={text:text(p.text,'Paragraph',4000)};
  insist(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(result.text),'Paragraph contains an invalid document character');
  if(p.repeat!==undefined){insist(p.repeat==='parties','Repeat over matter parties');result.repeat='parties';}
  if(p.when!==undefined){const q=questions.find(q=>q.key===p.when?.key);insist(q,'Conditional paragraph must name a questionnaire field');const value=typedValue(q,p.when.equals);insist(value!==undefined,'Conditional paragraph needs a value');result.when={key:q.key,equals:value};}
  for(const match of result.text.matchAll(/\{\{([^{}]+)\}\}/g)){
   const key=match[1];insist(/^(matter\.(title|number|client|caseNumber|court|feeArrangement|feeTerms|insuranceLimit)|custom\.[a-z][a-z0-9_]*|answer\.[a-z][a-z0-9_]*|party\.(name|relation))$/.test(key),`Unknown merge field ${key}`);
   if(key.startsWith('answer.'))insist(questions.some(q=>q.key===key.slice(7)),`Unknown questionnaire field ${key}`);
   if(key.startsWith('party.'))insist(result.repeat,'Party fields need a repeating party paragraph');
  }
  insist(!result.text.replace(/\{\{[^{}]+\}\}/g,'').includes('{{')&&!result.text.replace(/\{\{[^{}]+\}\}/g,'').includes('}}'),'Close every merge field with }}');
  return result;
 });
 return {jurisdiction:text(d.jurisdiction,'Jurisdiction',200),formVersion:text(d.formVersion,'Court form or template version',120),questions,paragraphs};
}
export function questionnaire(template:Template,raw:unknown){
 insist(raw&&typeof raw==='object'&&!Array.isArray(raw),'Supply questionnaire answers');const input=raw as Data,answers:Data={};
 for(const key of Object.keys(input))insist(template.questions.some(q=>q.key===key),`Unknown questionnaire answer ${key}`);
 for(const q of template.questions){const v=typedValue(q,input[q.key]);if(v!==undefined)answers[q.key]=v;}
 return answers;
}
export function render(template:Template,answers:Data,snapshot:Data){
 const unresolved=new Set<string>(),paragraphs:string[]=[];
 for(const q of template.questions)if(q.required&&blank(answers[q.key]))unresolved.add(`answer.${q.key}`);
 const fields={...snapshot.fields,...Object.fromEntries(template.questions.map(q=>['answer.'+q.key,q.type==='money'&&answers[q.key]!==undefined?(answers[q.key]/100).toFixed(2):answers[q.key]]))};
 for(const p of template.paragraphs){
  if(p.when&&answers[p.when.key]!==p.when.equals)continue;
  const repeats=p.repeat?snapshot.parties:[null];if(p.repeat&&!repeats.length)unresolved.add('parties');
  for(const party of repeats){const values={...fields,...(party?{'party.name':party.name,'party.relation':party.relation}:{})};paragraphs.push(p.text.replace(/\{\{([^{}]+)\}\}/g,(_,key:string)=>{if(blank(values[key])){unresolved.add(key);return `[Unresolved: ${key}]`;}return typeof values[key]==='boolean'?(values[key]?'Yes':'No'):String(values[key]);}));}
 }
 insist(paragraphs.join('\n').length<=150000,'Generated document is too long');return {paragraphs,unresolved:[...unresolved].sort()};
}
