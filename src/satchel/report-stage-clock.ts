// REPORT-001: successful stage intervals accrue only while the matter is open.
import {type Data} from './model';
export function stageDurations(m:Data,transitions:Data[],lifecycle:Data[],asOf:string){
 const end=Date.parse(asOf),events:Data[]=[...transitions.map(e=>({...e,stage:JSON.parse(e.detail)})),...lifecycle] as Data[];events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 let stage:string|null=null,name='',open=true,cursor=Date.parse(m.opened_at);
 const totals=new Map<string,Data>();
 const accrue=(until:number)=>{if(stage&&open&&until>=cursor){const r=totals.get(stage)??{stageId:stage,name,durationMs:0,date:new Date(cursor).toISOString().slice(0,10)};r.durationMs+=until-cursor;totals.set(stage,r);}};
 for(const e of events){const at=Math.min(Date.parse(e.at),end);if(at<cursor||Date.parse(e.at)>end)continue;accrue(at);if(e.kind==='transition'){stage=e.stage.stageId;name=e.stage.stageName;}else open=e.kind==='reopened';cursor=at;}
 accrue(end);return [...totals.values()];
}
