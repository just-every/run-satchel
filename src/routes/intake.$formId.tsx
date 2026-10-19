import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {PublicIntake} from '../ui/intake-public';
export const Route=createFileRoute('/intake/$formId')({head:()=>({links:[{rel:'stylesheet',href:'/intake.css'}]}),component:IntakePage});
function IntakePage(){const {formId}=Route.useParams();return <HydrationUnit><PublicIntake formId={formId}/></HydrationUnit>;}
