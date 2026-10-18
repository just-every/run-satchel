// Fictional firm records; dates are resolved relative to each visitor's start.
export const matters = [
 {id:'harbor', title:'Harbor Coffee — Riverside lease', client:'Harbor Coffee Roasters LLC', adverse:'Riverside Properties LLC', work:'Review renewal and repair provisions', source:'Lease clause 12; client instructions checked', deadline:'Send negotiated lease amendments', days:7},
 {id:'morgan', title:'Morgan family — estate plan', client:'Alex and Jamie Morgan', adverse:'Morgan Family Trust', work:'Prepare will and healthcare directive revisions', source:'Estate planning meeting and signed engagement', deadline:'Review final estate planning documents', days:14},
 {id:'cedar', title:'Cedar Studio — service agreement', client:'Cedar Design Studio Inc.', adverse:'Northstar Retail Group', work:'Negotiate scope and limitation of liability', source:'Services agreement schedule A, agreed review date', deadline:'Return agreed services schedule', days:3},
 {id:'park', title:'Park — employment settlement', client:'Elena Park', adverse:'Summit Technology Inc.', work:'Review settlement terms with client', source:'Settlement timetable confirmed by counsel', deadline:'Confirm settlement instructions', days:2},
 {id:'river', title:'Riverbend — asset purchase', client:'Riverbend Cycles LLC', adverse:'Willow Street Outfitters LLC', work:'Review inventory schedule and closing conditions', source:'Purchase agreement section 6, closing checklist', deadline:'Complete closing checklist review', days:21},
 {id:'chen', title:'Chen — property boundary agreement', client:'Daniel Chen', adverse:'Maple Court Owners Association', work:'Review survey and draft boundary consent', source:'Survey review conference and agreed next steps', deadline:'Deliver boundary agreement draft', days:10},
] as const
export const team = [
 {email:'maya.patel@example.com', name:'Maya Patel', role:'lawyer'},
 {email:'oliver.reed@example.com', name:'Oliver Reed', role:'lawyer'},
 {email:'nina.brooks@example.com', name:'Nina Brooks', role:'assistant'},
] as const

// Reuse the seed's existing fixtures/clio-contacts.csv in the conflict register.
// These are native demo records, not a claim of a completed Clio migration.
export const contacts = [
 {id:'demo-clio-contact-101',name:'Amelia Chen',aliases:'A. Chen',email:'amelia.chen@example.test'},
 {id:'demo-clio-contact-102',name:'Riverbend Holdings Pty Ltd',aliases:'Riverbend',email:'office@riverbend.example.test'},
 {id:'demo-clio-contact-103',name:'Jonah Reed',aliases:'J. Reed',email:'jonah.reed@example.test'},
] as const
export const firm = {name:'Bennett Patel Reed LLP', email:'office@example.com', phone:'(212) 555-0147', line1:'48 Hudson Street', line2:'Suite 600', city:'New York', state:'NY', zip:'10013', timezone:'America/New_York', default_rate_cents:30000, billing_increment_minutes:6, payment_terms_days:30, fiscal_year_start_month:1, accounting_basis:'cash'}
export const practiceAreas = [{code:'RE', name:'Real estate'}, {code:'EST', name:'Estates and trusts'}, {code:'EMP', name:'Employment'}]
