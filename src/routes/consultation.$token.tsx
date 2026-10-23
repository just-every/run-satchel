import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {ManageBooking} from '../ui/booking-public';
export const Route=createFileRoute('/consultation/$token')({head:()=>({links:[{rel:'stylesheet',href:'/intake.css'}]}),component:ManagePage});
function ManagePage(){const {token}=Route.useParams();return <HydrationUnit><ManageBooking token={token}/></HydrationUnit>;}
