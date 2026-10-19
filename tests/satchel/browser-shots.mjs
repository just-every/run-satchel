import {mkdir} from 'node:fs/promises';
// Keep the real viewport fixed while documenting long forms. Element screenshots
// resize/scroll around oversized panels; viewport tiles show what a person sees.
export async function capturePanel(page,target,directory,stem){
 await mkdir(directory,{recursive:true});
 const box=await target.evaluate(element=>{const panel=element.closest('article.record')??element.closest('section.panel')??element,rect=panel.getBoundingClientRect();return {top:rect.top+window.scrollY,height:rect.height};});
 const step=page.viewportSize().height-80;
 for(let offset=0,index=0;offset<box.height;offset+=step,index++){
  await page.evaluate(top=>window.scrollTo({left:0,top,behavior:'instant'}),Math.max(0,box.top+offset-20));
  await page.screenshot({path:`${directory}/${stem}-${index}.png`});
 }
}
