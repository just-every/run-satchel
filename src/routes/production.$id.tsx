import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {ProductionRecipient} from '../ui/production-recipient';
export const Route=createFileRoute('/production/$id')({head:()=>({links:[{rel:'stylesheet',href:'/intake.css'}],meta:[{name:'robots',content:'noindex,nofollow'},{name:'referrer',content:'no-referrer'}]}),component:RecipientPage});
function RecipientPage(){const {id}=Route.useParams();return <HydrationUnit><ProductionRecipient shareId={id}/></HydrationUnit>;}
