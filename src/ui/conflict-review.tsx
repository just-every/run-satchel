import {type Row} from './common';

export function ConflictReview({search,choose}:{search:Row;choose:(matterId:string)=>void}){
 const matches:Row[]=typeof search.matches==='string'?JSON.parse(search.matches):search.matches;
 const summary=search.search_summary===undefined?search:search.search_summary?JSON.parse(search.search_summary):null;
 return <section aria-label="Conflict search results">
  <h3>{matches.length} possible matches</h3>
  {summary?.searchedContacts!==undefined?<p>Searched {summary.searchedContacts} contacts across {summary.searchedIdentities} source identities. Closed years use {summary.timezone}.</p>:<p>Legacy search: searched-contact and source-identity counts were not recorded.</p>}
  <p>Search covers this firm’s records only and cannot guarantee there is no conflict.</p>
  {matches.map(match=><article className="record" key={match.id}>
   <strong>{match.name}</strong><p>{Array.isArray(match.aliases)?match.aliases.join('; '):match.aliases}</p>
   {match.identities&&<p>{match.identities.length} source identities grouped as one contact</p>}
   {match.matterContext?.map((context:Row,index:number)=><p key={context.matterId+':'+context.role+':'+index}>
    {context.classification==='former_client'?'Former client':context.classification==='current_client'?'Current client':context.role} · {context.role} · {context.status==='closed'?`Closed ${context.closedYear??'year not recorded'}`:'Open'} · <button type="button" className="quiet" onClick={()=>choose(context.matterId)}>{context.number} · {context.title}</button>
   </p>)}
   <details><summary>Source identities and recorded match</summary><pre>{JSON.stringify(match,null,2)}</pre></details>
  </article>)}
 </section>;
}
