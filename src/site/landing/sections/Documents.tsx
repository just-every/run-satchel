import { matter } from '../matter'
import { Check, Icon, Tab } from '../parts'
import { signature } from '../signature'

const FOLDERS: [string, number][] = [['Pleadings', 12], ['Discovery', 48], ['Correspondence', 131], ['Photos', 22], ['Billing', 9]]

/** TAB 4 (mirrored): email files itself, every scan is searchable, templates fill from the matter, clients sign online. */
export function Documents() {
  return <section id="documents" className="band band-white documents" aria-labelledby="documents-title">
    <div className="sheet">
      <div className="docs-cluster" aria-label={`${matter.title}: documents, an email filed to the matter, a notice and a signature`}>
        <div className="card mail-card">
          <Icon name="mail" />
          <div><p className="mail-from"><b>From: Kevin Holt</b> · Holt &amp; Barr LLP</p><p className="mail-re">Re: deposition dates</p><p className="row-note ok small"><Check />Filed to {matter.title} · 2 attachments</p></div>
        </div>
        <div className="card folder-card">
          <h3><Icon name="folder" className="folder" />{matter.title} · Documents</h3>
          <ul className="folders">{FOLDERS.map(([name, count]) => <li key={name}><Icon name="folder" className="folder" /><span>{name}</span><span className="count">{count}</span></li>)}</ul>
          <p className="search-box"><Icon name="search" /><span>framing failed</span><Icon name="close" className="clear" /></p>
          <div className="hit"><span className="pdf" aria-hidden="true">PDF</span><div><p className="hit-file">Foreman_Deposition_Transcript.pdf · p.48</p><p className="hit-text">…the <mark>framing failed</mark> inspection twice…</p></div></div>
        </div>
        <div className="card notice-card">
          <h3><Icon name="doc" />Notice of deposition</h3>
          <dl><dt>Deponent</dt><dd>Tom Reed</dd><dt>Date</dt><dd>Nov 4, 9:30 am</dd><dt>Place</dt><dd>600 Congress Ave</dd></dl>
          <p className="row-note ok small"><Check />Filled from the matter · 7 fields</p>
        </div>
        <div className="card sign-card">
          <h3><Icon name="pen" />Bank records authorization</h3>
          <svg className="signature" viewBox={signature.viewBox} role="img" aria-label="Signature: Ana Martinez"><path d={signature.d} /></svg>
          <p className="row-note ok small"><Check />Signed by Ana Martinez · Sep 17</p>
        </div>
      </div>
      <div className="docs-lead">
        <Tab n={4} name="Documents" />
        <h2 id="documents-title">Every page filed.<br /> Every word found.</h2>
        <p className="lead-body">Email files itself to the matter from Outlook or Gmail. Every scan is searchable, templates fill from the matter and clients sign online.</p>
      </div>
    </div>
  </section>
}
