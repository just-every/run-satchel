import assert from 'node:assert/strict';
// BILL-004: existing financial journeys explicitly review synthetic exemptions
// through the same public doors as a person. No harness interception or defaults.
export async function fixtureBill(h,path){
 const id=path.split('/')[2];
 for(const m of (await h.json('/workspace',undefined,h.owner)).matters){
  const b=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===id);
  if(b)return b;
 }
 assert.fail('Fixture bill is not visible: '+id);
}
export async function exemptTaxReview(h,path){
 const b=await fixtureBill(h,path);
 if(b.snapshot.taxBasis)return (await h.json('/bills/'+b.id+'/tax-reviews',{revision:b.revision},h.owner)).id;
 const rule=await h.json('/matters/'+b.matterId+'/tax-rules',{state:'NY',jurisdiction:'Synthetic New York exemption fixture',rounding:'half_up',reference:'Counsel-reviewed synthetic exemption for this financial journey; not tax advice',reviewed:true,service:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed service exemption'},expense:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed expense exemption'},trust:{eligibility:'permitted',reference:'Synthetic reviewed tax draw-down authority'},...(b.snapshot.ledes?{ledesMapping:{clientLedesId:b.snapshot.ledes.clientId,expenseCode:'E999',taxIdNumber:'SYNTHETIC-TAX',taxType:'Sales',reference:'Synthetic client-reviewed tax mapping'}}:{})},h.owner);
 return (await h.json('/bills/'+b.id+'/tax-reviews',{revision:b.revision,ruleId:rule.id},h.owner)).id;
}
export async function withTaxAllocation(h,body){
 const b=await fixtureBill(h,'/bills/'+body.billId+'/approve');
 if(!b.snapshot.taxReview)return body;
 const prior=(await h.json('/trust/transfers',undefined,h.owner)).find(t=>t.request_key===body.requestKey);
 if(prior?.allocation_reference)return {...body,allocation:{earnedCents:prior.allocation_earned,taxCents:prior.allocation_tax,reference:prior.allocation_reference}};
 const ledger=(await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.id===body.ledgerId);
 const amount=Math.max(0,Math.min(b.trustPayment.reservable_cents,ledger?.available_cents??0));
 assert.equal(b.snapshot.taxCents,0,'Existing non-tax fixtures must explicitly review zero tax');
 return {...body,allocation:{earnedCents:amount,taxCents:0,reference:'Officer reviewed exact earned-base allocation and explicit zero tax'}};
}
// Refresh through real workspace navigation, then select the exact review in UI.
export async function selectExemptTax(h,page,card){
 const title=(await card.locator('strong').first().textContent()).split(' · ')[0];
 let selected;
 for(const m of (await h.json('/workspace',undefined,h.owner)).matters){const b=(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(b=>b.status==='draft'&&b.snapshot.title===title);if(b){selected=b;break;}}
 assert.ok(selected,'Visible draft to review');
 const reviewId=await exemptTaxReview(h,'/bills/'+selected.id+'/approve');
 const nav=page.getByRole('navigation',{name:'Workspace'});
 await nav.getByRole('button',{name:'Matters',exact:true}).click();
 await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();
 await nav.getByRole('button',{name:'Time & bills',exact:true}).click();
 await page.getByRole('heading',{level:1,name:'Time & bills',exact:true}).waitFor();
 await page.getByLabel('Current matter').selectOption(selected.matterId);
 await card.getByLabel('Reviewed tax calculation',{exact:true}).selectOption(reviewId);
}
