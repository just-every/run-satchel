import {pageResponse} from '../modules/operator-auth/page.mjs';
import {escapeHtml} from '../modules/operator-auth/http.mjs';
import {fontDocumentResponse} from '../base/font-response';
import branding from '../branding.json';
export async function securityCheckPage(error='',status=200){
 const content='<p>Enter your security passphrase and the current authenticator code to open this device.</p>'+(error?'<p role="alert"><strong>'+escapeHtml(error)+'</strong></p>':'')+'<form method="post" action="/security-check"><label>Security passphrase<input name="passphrase" type="password" autocomplete="current-password" required></label><label>Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label><button>Verify authenticator</button></form><p class="secondary-link"><a href="/signin">Return to sign in</a></p>';
 return fontDocumentResponse(await pageResponse({branding:{productName:branding.name,accentColor:branding.primaryColor,signInPath:'/signin',theme:'/rer-theme.css',mark:'/brand/mark.svg'},title:'Authenticator check · Satchel',heading:'Authenticator check',content,status,referrer:'strict-origin'}));
}
