import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {StopFollowups} from '../ui/booking-public';
export const Route=createFileRoute('/followup/$id/$signature')({head:()=>({links:[{rel:'stylesheet',href:'/intake.css'}]}),component:StopPage});
function StopPage(){const {id,signature}=Route.useParams();return <HydrationUnit><StopFollowups id={id} signature={signature}/></HydrationUnit>;}
