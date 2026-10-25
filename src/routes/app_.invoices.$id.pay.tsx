import {createFileRoute} from '@tanstack/react-router';
import {HydrationUnit} from '../base/hydration/unit';
import {InvoicePayment} from '../ui/invoice-payment';
export const Route=createFileRoute('/app_/invoices/$id/pay')({component:Page});
function Page(){const {id}=Route.useParams();return <HydrationUnit><InvoicePayment billId={id}/></HydrationUnit>;}
