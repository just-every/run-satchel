import { links } from './links'

/** The lockup: the satchel mark and "Satchel" in the heading face. `tone="light"` is for dark grounds and the painted hero. */
export function Brand({ tone = 'ink', tile = false }: { tone?: 'ink' | 'light'; tile?: boolean }) {
  return <a className={`brand brand-${tone}`} href={links.home}>
    <span className={tile ? 'brand-mark tile' : 'brand-mark'}><img src="/brand/mark.svg" alt="" width="40" height="40" /></span>
    <span className="brand-word">Satchel</span>
  </a>
}
