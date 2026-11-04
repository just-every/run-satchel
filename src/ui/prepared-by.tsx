export type PreparedBy={
 agent:{id:string|null;name:string|null};
 for:{id:string|null;name:string|null};
 label:string|null;
 legacy:boolean;
};

export const preparationLabel=(value:PreparedBy|null|undefined)=>value?.label??'Preparation label unrecorded';

export function PreparationAttribution({value,original=false}:{value:PreparedBy|null|undefined;original?:boolean}){
 const unrecorded=[
  !value?.agent.id&&'Agent ID unrecorded',
  !value?.agent.name&&'Agent name unrecorded',
  !value?.for.id&&'Person ID unrecorded',
  !value?.for.name&&'Person name unrecorded',
 ].filter(Boolean);
 return <p>{original?'Original preparation: ':'Prepared by: '}{preparationLabel(value)}{value?.legacy&&<> · <span className="badge">Legacy</span></>}{unrecorded.length>0&&<><br/>{unrecorded.join(' · ')}</>}</p>;
}
