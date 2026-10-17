// The one matter the homepage follows, Martinez v. Reed at Okafor & Lee Law (Austin, Texas), from the first call to
// the trust reconciliation. Every section reads its figures from here, so the same record shows the same numbers
// everywhere and the totals add up (checked at build time by the asserts at the bottom).

export const firm = { name: 'Okafor & Lee Law', partner: 'Dana Okafor', associate: 'Marcus Lee', paralegal: 'Rosa Diaz' }
export const matter = { title: 'Martinez v. Reed', number: '2026-0147', client: 'Ana Martinez', opposing: 'Reed Construction LLC', court: 'Travis County District Court', atIssue: 4860000 }
export const rates = { attorney: 30000, paralegal: 17500 }

/** USD cents as the page prints them: $48,600.00, or $3,250 with `whole`. */
export const usd = (cents: number, whole = false) => {
  const sign = cents < 0 ? '−' : ''
  const value = Math.abs(cents) / 100
  return sign + '$' + value.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })
}

export const intake = {
  submitted: 'Sep 8 · 9:14 am',
  contactsSearched: 1912,
  match: 'Reed Construction LLC · former client, closed 2023',
  cleared: `Reviewed by ${firm.partner} · no conflict · cleared 9:41 am`,
  retainer: 500000,
  retainerAt: 'Sep 8 · 11:52 am',
}

/** Trial moves Feb 8 → Mar 22, 2027; every scheduling-order deadline moves the same 42 days. */
export const trial = { was: 'Feb 8, 2027', now: 'Mar 22, 2027', day: 'Mon Mar 22, 2027', time: '9:00 am', room: 'Courtroom 4B', shiftDays: 42 }
export const deadlines: [name: string, was: string, now: string, rule: string][] = [
  ['Expert designations', 'Dec 9, 2026', 'Jan 20, 2027', 'Scheduling order ¶2'],
  ['Discovery closes', 'Jan 8, 2027', 'Feb 19, 2027', 'Scheduling order ¶3'],
  ['Mediation completed', 'Jan 22, 2027', 'Mar 5, 2027', 'Scheduling order ¶4'],
  ['Pretrial motions', 'Jan 25, 2027', 'Mar 8, 2027', 'Scheduling order ¶5'],
  ['Pretrial conference', 'Feb 1, 2027', 'Mar 15, 2027', 'Scheduling order ¶6'],
]
export const discoveryDue = 'Nov 14'
export const mediation = { date: 'Mar 5, 2027', day: 'Fri Mar 5', time: '9:00 am', place: '600 Congress Ave, Suite 1200' }

/** Marcus Lee's Oct 15, drafted from his email, calendar and documents. */
export const day = {
  date: 'Oct 15',
  entries: [
    { code: 'L120', hours: 0.3, text: 'Reviewed Holt email re: deposition dates', source: 'email' },
    { code: 'L160', hours: 2.1, text: 'Drafted settlement demand', source: 'document' },
    { code: 'L330', hours: 2.5, text: 'Deposition of Reed foreman', source: 'calendar' },
    { code: 'L160', hours: 1.2, text: 'Mediation statement', source: 'document' },
    { code: 'A106', hours: 0.3, text: 'Call with Ana Martinez, 14 min', source: 'found unlogged, added', found: true },
  ],
}
export const dayHours = Math.round(day.entries.reduce((sum, entry) => sum + entry.hours * 10, 0)) / 10
export const dayValue = Math.round(dayHours * rates.attorney)

/** Invoice #2041, September's work for Ana Martinez. */
export const invoice2041 = {
  number: '#2041', period: 'Sep 1–30', paid: 'Paid online by card · Oct 6',
  lines: [
    { text: `${firm.associate} · 8.6 h × $300`, cents: Math.round(8.6 * rates.attorney) },
    { text: `${firm.paralegal} · 3.2 h × $175`, cents: Math.round(3.2 * rates.paralegal) },
    { text: 'County filing fee', cents: 11000 },
  ],
}
export const invoice2041Total = invoice2041.lines.reduce((sum, line) => sum + line.cents, 0)
export const invoice2033 = { number: '#2033', client: 'Brennan Holdings', overdue: '30 days overdue · reminder sent Oct 1', plan: 'Payment plan agreed · 3 × $1,400.00 · first paid Oct 9' }

/** September's IOLTA three-way reconciliation, signed off Oct 2. */
export const trust = {
  statement: 1323000,
  outstanding: { check: 'Check 1187', payee: 'Lone Star Experts', cents: 75000 },
  ledger: 1248000,
  clientLedgers: 1248000,
  reconciled: `Three-way reconciled · Oct 2 · ${firm.paralegal}`,
  martinez: [
    { date: 'Sep 8', text: 'Retainer deposit', cents: 500000 },
    { date: 'Sep 24', text: 'Expert inspection fee · Check 1187', cents: -75000 },
  ],
}
export const adjustedBank = trust.statement - trust.outstanding.cents
export const martinezBalance = trust.martinez.reduce((sum, line) => sum + line.cents, 0)

/** The firm's move from Clio, before Martinez v. Reed opened in Satchel on Sep 8. */
export const clio = {
  matters: 412, contacts: 1906, documents: 18240, timeEntries: 9871, unbilled: 4138000,
  trustClients: 63, trustDiffered: 1250, trustMatched: 823000,
}

// The page's arithmetic, checked whenever the site builds.
const check = (ok: boolean, what: string) => { if (!ok) throw new Error(`Homepage sample data: ${what}`) }
check(dayHours === 6.4 && dayValue === 192000, 'the day card totals 6.4 h · $1,920.00')
check(invoice2041Total === 325000, 'invoice #2041 totals $3,250.00')
check(adjustedBank === trust.ledger && trust.ledger === trust.clientLedgers, 'the three balances agree')
check(martinezBalance === 425000, 'the Martinez trust ledger nets to $4,250.00')
check(clio.trustMatched + martinezBalance === trust.ledger, 'the imported trust total plus Martinez is September’s trust ledger')
check(intake.contactsSearched > clio.contacts, 'the conflict search covers every imported contact')
