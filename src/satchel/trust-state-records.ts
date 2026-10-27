import {insist,type Data} from './model';

// These are source-grounded review packets, never a compliance certification.
// Missing original record categories remain explicit rather than invented.
export function stateTrustRecords(report:Data,state:string){
 insist(state==='CA'||state==='NY','Choose CA or NY');
 const period=report.period,entryIds=report.entries.map((e:Data)=>e.id);
 const fields=[
  {name:'periodStart',value:period.start_date,sources:[{table:'s_trust_periods',id:period.id,column:'start_date'}]},
  {name:'periodEnd',value:period.end_date,sources:[{table:'s_trust_periods',id:period.id,column:'end_date'}]},
  {name:'bankStatementClosingCents',value:report.bankClosingCents,sources:[{table:'s_trust_periods',id:period.id,column:'closing_balance_cents',document:report.sourceDocument}]},
  {name:'bankRegisterCents',value:report.registerCents,sources:report.bankEntries.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))},
  {name:'clientLedgerTotalCents',value:report.subsidiaryCents,sources:report.entries.filter((e:Data)=>e.ledger_id!==null).map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))},
  {name:'outstandingDepositCents',value:report.outstandingDepositsCents,sources:report.outstandingDeposits.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents',clearedDate:e.clearedDate,clearance:e.clearance}))},
  {name:'outstandingCheckCents',value:report.outstandingChecksCents,sources:report.outstandingChecks.map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents',clearedDate:e.clearedDate,clearance:e.clearance}))},
  {name:'adjustedBankCents',value:report.adjustedBankCents,formula:'Bank statement closing plus outstanding deposits minus outstanding checks',sources:[{table:'s_trust_periods',id:period.id,column:'closing_balance_cents'},...report.outstandingDeposits.concat(report.outstandingChecks).map((e:Data)=>({table:'s_trust_entries',id:e.id,column:'cents'}))]},
 ];
 const journal=report.entries.filter((e:Data)=>e.effective_date>=period.start_date).map((e:Data)=>({entryId:e.id,ledgerId:e.ledger_id,date:e.effective_date,cents:e.cents,kind:e.kind,sourceRecordId:e.source_id,approvedBy:e.approved_by,postedAt:e.at,originals:e.sources,clearance:e.clearance,transaction:e.transaction??null}));
 const ledgers=report.ledgers.map((l:Data)=>({ledgerId:l.id,matterId:l.matter_id,client:l.client,matterNumber:l.matter_number,balanceCents:l.balanceCents,entryIds:report.entries.filter((e:Data)=>e.ledger_id===l.id).map((e:Data)=>e.id)}));
 const common={state,periodId:period.id,startDate:period.start_date,endDate:period.end_date,reviewRequired:true,complete:false,fields,journal,ledgers,statementOriginal:report.sourceDocument,entryIds,
  boundary:'Firm review is required. This packet does not certify legal compliance, file an annual report or enforce a statutory retention period.'};
 if(state==='CA')return {...common,rule:'California Rule 1.15 monthly reconciliation',reconciliation:{balanced:report.balanced,differences:report.differences},
  annualReporting:{program:'Client Trust Account Protection Program',year:period.end_date.slice(0,4),accountRecordId:report.account.id,accountName:report.account.name,bankReferenceLastFour:report.account.bank_reference,status:'Incomplete: firm must review annual answers and account registration fields'},
  missing:['Reviewed CTAPP annual answers and complete institution and account registration fields','Firm approval of the monthly state report']};
 return {...common,rule:'New York Rule 1.15(d)',requiredRetentionYears:7,
  recordIndex:{receiptsAndDisbursements:journal,clientLedgers:ledgers,bankStatement:report.sourceDocument},
  missing:['Complete retained client retainer and compensation agreements','Complete client account statements, bills and disbursement records','Complete checkbooks, check stubs, cancelled checks and duplicate deposit slips','Seven-year preservation of all required records','Firm approval of the required-records report']};
}
