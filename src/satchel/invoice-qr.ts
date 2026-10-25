import {insist} from './model';

// QR Model 2, version 8-L, byte mode. Two equal Reed-Solomon blocks.
// A fixed version keeps the bounded authenticated URL deterministic; no remote QR service sees it.
export function invoiceQr(value:string):boolean[][] {
 const input=new TextEncoder().encode(value);insist(input.length<=192,'Invoice payment address is too long for the QR code');
 const bits:number[]=[];const add=(v:number,n:number)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);};
 add(4,4);add(input.length,8);for(const v of input)add(v,8);
 add(0,Math.min(4,194*8-bits.length));while(bits.length%8)bits.push(0);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));
 for(let pad=0;data.length<194;pad++)data.push(pad%2?0x11:0xec);
 const mul=(a:number,b:number)=>{let r=0;for(let i=7;i>=0;i--){r=(r<<1)^((r>>>7)*0x11d);r^=((b>>>i)&1)*a;}return r;};
 let polynomial=[1];for(let i=0,root=1;i<24;i++,root=mul(root,2)){
  const next=Array(polynomial.length+1).fill(0);for(let j=0;j<polynomial.length;j++){next[j]^=polynomial[j];next[j+1]^=mul(polynomial[j],root);}polynomial=next;
 }
 const blocks=[data.slice(0,97),data.slice(97)],checks=blocks.map(block=>{
  const rem=Array(24).fill(0);for(const byte of block){const factor=byte^rem.shift()!;rem.push(0);for(let j=0;j<24;j++)rem[j]^=mul(polynomial[j+1],factor);}return rem;
 });
 const stream:number[]=[];for(let i=0;i<97;i++)for(const block of blocks)stream.push(block[i]);for(let i=0;i<24;i++)for(const check of checks)stream.push(check[i]);
 const n=49,grid=Array.from({length:n},()=>Array(n).fill(false)),reserved=grid.map(row=>row.map(()=>false));
 const set=(x:number,y:number,v:boolean)=>{if(x>=0&&y>=0&&x<n&&y<n){grid[y][x]=v;reserved[y][x]=true;}};
 for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,d!==2&&d!==4);}
 for(const cy of [6,24,42])for(const cx of [6,24,42]){
  if((cx===6&&cy===6)||(cx===6&&cy===42)||(cx===42&&cy===6))continue;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);
 }
 // Format: L=01, mask=000, BCH(15,5), XOR mask 0x5412.
 let format=8<<10;for(let i=14;i>=10;i--)if((format>>>i)&1)format^=0x537<<(i-10);format=((8<<10)|format)^0x5412;
 const f=(i:number)=>Boolean((format>>>i)&1);
 for(let i=0;i<=5;i++)set(8,i,f(i));set(8,7,f(6));set(8,8,f(7));set(7,8,f(8));for(let i=9;i<15;i++)set(14-i,8,f(i));
 for(let i=0;i<8;i++)set(n-1-i,8,f(i));for(let i=8;i<15;i++)set(8,n-15+i,f(i));set(8,n-8,true);
 let version=8<<12;for(let i=17;i>=12;i--)if((version>>>i)&1)version^=0x1f25<<(i-12);version|=8<<12;
 for(let i=0;i<18;i++){const v=Boolean((version>>>i)&1),a=n-11+i%3,b=Math.floor(i/3);set(a,b,v);set(b,a,v);}
 let index=0;for(let right=n-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<n;vert++){
  const y=((right+1)&2)===0?n-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(reserved[y][x])continue;const bit=index<stream.length*8?((stream[index>>>3]>>>(7-(index&7)))&1):0;grid[y][x]=Boolean(bit^((x+y)%2===0?1:0));index++;}
 }}
 return grid;
}
