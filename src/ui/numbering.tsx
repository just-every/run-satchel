import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
export function Numbering({run,tick}:{run:Run;tick:number}){
 const [settings,setSettings]=useState<Row>();
 useEffect(()=>{api('/numbering').then(setSettings).catch(e=>run(async()=>{throw e;}));},[tick]);
 return <section className="panel"><h2>Matter numbering</h2><p>Use {'{sequence}'}, {'{year}'}, {'{client}'} and {'{practice}'} with separators. Changes affect later matters; existing numbers stay fixed. Imported matters keep their source number. Client numbers are assigned automatically unless entered when opening the client’s first matter.</p>{settings&&<Form key={settings.revision} label="Save number pattern" submit={d=>run(()=>api('/numbering',{...d,start:Number(d.start),padding:Number(d.padding),perClient:d.perClient==='on',revision:settings.revision}),'Matter number pattern saved')}><Field name="pattern" label="Matter number pattern" value={settings.pattern}/><Field name="start" label="Starting sequence number" type="number" value={settings.start}/><Field name="padding" label="Sequence digits" type="number" value={settings.padding}/><label className="check"><input name="perClient" type="checkbox" defaultChecked={settings.perClient}/>Separate sequence for each client (include {'{client}'})</label></Form>}</section>;
}
