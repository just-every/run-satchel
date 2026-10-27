import type {Bindings} from '../auth.server';
import type {Session} from '../modules/operator-auth/index.mjs';
import {Fault,insist,stmt,type Actor,type Data} from './model';
import {mfaRequired,verifyMfa} from './session-mfa';
import {securityCheckPage as page} from './security-page.mjs';
export async function securityGate(request:Request,env:Bindings,session:Session|null){
 const path=new URL(request.url).pathname;
 if(path==='/security-check'){
  if(!session)return Response.redirect(env.AUTH_ORIGIN+'/signin',303);
  if(request.method==='POST'){
   try{
    insist(new URL(request.url).origin===env.AUTH_ORIGIN&&request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid request origin',403);
    const member=await stmt(env.DB,'SELECT role FROM s_members WHERE email=? AND active=1',session.operator.email).first<Data>();
    const role=session.operator.role==='owner'?'owner':member?.role;insist(role,'Ask the principal to add you to the firm',403);
    const actor:Actor={id:session.operator.id,email:session.operator.email,name:session.operator.displayName,role,channel:'person'};
    await verifyMfa(env,actor,session,Object.fromEntries(await request.formData()));
    return Response.redirect(env.AUTH_ORIGIN+'/app',303);
   }catch(e){return page(e instanceof Fault?e.message:'Authenticator verification could not complete',e instanceof Fault?e.status:500);}
  }
  if(!await mfaRequired(env,session))return Response.redirect(env.AUTH_ORIGIN+'/app',303);
  return page();
 }
 if(!session||/^\/api\/satchel\/security\/mfa(?:\/|$)/.test(path)||['/signin','/auth/signout','/auth/magic-link','/auth/confirm'].includes(path))return null;
 if(!await mfaRequired(env,session))return null;
 if(path.startsWith('/api/')||path.startsWith('/auth/'))return Response.json({error:'Verify your authenticator to continue',challenge:'/security-check'},{status:403,headers:{'cache-control':'no-store'}});
 if(path==='/setup'||path==='/app'||path.startsWith('/app/'))return Response.redirect(env.AUTH_ORIGIN+'/security-check',303);
 return null;
}
