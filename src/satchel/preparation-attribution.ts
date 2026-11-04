import type {Data} from './model';

type Identity={id:string|null;name:string|null};
export type PreparationAttribution={agent:Identity;for:Identity;label:string|null;legacy:boolean};

// Only retained fields participate. Current membership never fills history.
export function preparationAttribution(record:Data,recorded?:Data|null):PreparationAttribution {
 const snapshot=recorded??(record.prepared_identity?JSON.parse(record.prepared_identity):null);
 if(snapshot){
  const agent={id:snapshot.agent?.id??null,name:snapshot.agent?.name??null},person={id:snapshot.for?.id??null,name:snapshot.for?.name??null},label=snapshot.label??record.agent_label??null;
  return {agent,for:person,label,legacy:![agent.id,agent.name,person.id,person.name,label].every(Boolean)};
 }
 return {
  agent:{id:record.prepared_agent_id??null,name:null},
  for:{id:record.sponsor_id??null,name:null},
  label:record.agent_label??null,legacy:true,
 };
}
