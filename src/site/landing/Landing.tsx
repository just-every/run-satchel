import { SiteHeader,SiteFooter,Actions } from './chrome'
import { HeroDrawing,FeatureDrawing,Included,Mat } from './drawings'
import './landing.css'
const features=[
 ['free','100% free.','MIT licensed. Every line is yours to read, run and change.'],
 ['conflicts','Conflicts first.','Search clients, adverse parties and aliases. Your conclusion is recorded with the matter.'],
 ['bills','Time to bill, in one review.','Prepare a bill from unbilled work, approve the exact lines, download the CSV.'],
 ['documents','Every original, every version.','Keep a file for the whole matter, or for you and the principal only.'],
 ['deadlines','Deadlines a lawyer confirms.','Record the date, timezone and citation. A lawyer confirms it and notes what was done.'],
 ['move-in','Move in from Clio.','Preview your contacts, commit the reviewed file, undo it any time.'],
 ['keep','Yours to keep.','Download the whole firm archive and restore it into a new installation.'],
]
export function Landing(){return <div className="site"><SiteHeader/><main><section className="site-hero"><h1>Your law practice, in order.</h1><p className="hero-subhead">Conflict checks, time, bills, files and deadlines for a small law firm, in one place.</p><p className="free-line">100% free, open source alternative to <strong>Clio</strong>, <strong>MyCase</strong> and <strong>PracticePanther</strong></p><Actions/><p className="licence-line">Free and open source, MIT licensed.</p><HeroDrawing/></section><div className="site-sections">{features.map(([id,title,line],i)=><section id={id} className={`feature ${i%2?'reversed':''}`} key={id}><div className="feature-copy"><h2>{title}</h2><p>{line}</p></div><FeatureDrawing kind={id}/></section>)}<section id="included" className="included"><h2>Also included</h2><Included/></section><section id="start" className="closing"><Mat><h2>Open your next matter.</h2><Actions/></Mat></section></div></main><SiteFooter/></div>}
