import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {PublicBooking} from '../ui/booking-public';
export const Route=createFileRoute('/book/$offerId')({head:()=>({links:[{rel:'stylesheet',href:'/intake.css'}]}),component:BookingPage});
function BookingPage(){const {offerId}=Route.useParams();return <HydrationUnit><PublicBooking offerId={offerId}/></HydrationUnit>;}
