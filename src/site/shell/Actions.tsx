import { links } from './links'

/** The page's one action, Run Satchel (the petrol button), then the demo and the docs as text links. */
export function Actions({ demo = true }: { demo?: boolean }) {
  return <div className="site-actions">
    <a className="site-button" href={links.run}>Run Satchel <span aria-hidden="true">→</span></a>
    {demo && <a className="site-link" href={links.demo}>Try the demo</a>}
    <a className="site-link" href={links.docs}>Read the docs</a>
  </div>
}
