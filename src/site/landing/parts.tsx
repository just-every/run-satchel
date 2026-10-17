// The pieces every section is made of. Text in the drawings is real text; the drawings are HTML and CSS
// (styles/cards.css), never screenshots. Painted art is only the hero, the trust binder, the interlude and the closing.
import type { ReactNode } from 'react'

/** A binder index tab on the matter line: walnut on light sections, brass on the dark one. */
export function Tab({ n, name, tone = 'walnut' }: { n: number; name: string; tone?: 'walnut' | 'brass' }) {
  return <p className={`tab tab-${tone}`} style={{ ['--n' as string]: n }}><span>Tab {n} · {name}</span></p>
}

/** A section heading with its tab, heading and paragraph. */
export function Lead({ id, n, name, title, children, tone }: { id: string; n: number; name: string; title: ReactNode; children: ReactNode; tone?: 'walnut' | 'brass' }) {
  return <div className="lead">
    <Tab n={n} name={name} tone={tone} />
    <h2 id={`${id}-title`}>{title}</h2>
    <p className="lead-body">{children}</p>
  </div>
}

/** A painted plate: AVIF, then WebP, at the sizes public/site holds; `phone` swaps in a narrower crop on phones. */
export function Painting({ name, widths, sizes, alt = '', className, phone, eager = false }: { name: string; widths: number[]; sizes: string; alt?: string; className?: string; phone?: { name: string; widths: number[]; media: string }; eager?: boolean }) {
  const set = (n: string, ws: number[], ext: string) => ws.map(w => `/site/${n}-${w}.${ext} ${w}w`).join(', ')
  const largest = Math.max(...widths)
  return <picture className={className}>
    {phone && <source media={phone.media} type="image/avif" srcSet={set(phone.name, phone.widths, 'avif')} sizes="100vw" />}
    {phone && <source media={phone.media} type="image/webp" srcSet={set(phone.name, phone.widths, 'webp')} sizes="100vw" />}
    <source type="image/avif" srcSet={set(name, widths, 'avif')} sizes={sizes} />
    <img src={`/site/${name}-${largest}.webp`} srcSet={set(name, widths, 'webp')} sizes={sizes} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
  </picture>
}

const PATHS: Record<string, ReactNode> = {
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
  invoice: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M14.2 11.2c-.4-.6-1.1-.9-1.9-.9-1 0-1.8.5-1.8 1.3 0 1.9 3.8 1 3.8 3 0 .8-.8 1.4-1.9 1.4-.9 0-1.6-.4-2-1M12.4 9.4v1M12.4 16v1" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  sync: <><path d="M19.5 9A8 8 0 0 0 5 7.6M4.5 15A8 8 0 0 0 19 16.4" /><path d="M5 3.5v4.2h4.2M19 20.5v-4.2h-4.2" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
  warn: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17v.3" /></>,
  bank: <><path d="M3.5 9 12 4l8.5 5zM4.5 20.5h15M6.5 11v7M10 11v7M14 11v7M17.5 11v7" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="1.5" /><path d="m5.5 16.5 4-4.5 3 3 2.5-2.5 3.5 4" /><circle cx="15.5" cy="9" r="1.3" /></>,
  chat: <><path d="M4 11.5c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5-3.6 6.5-8 6.5c-1 0-1.9-.1-2.8-.4L5 19.5l1.2-3.6C4.8 14.7 4 13.2 4 11.5z" /></>,
  folder: <><path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8.8A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  pen: <><path d="m14.5 5.5 4 4L9 19l-5 1 1-5z" /><path d="m12.5 7.5 4 4M17 3l4 4" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  moon: <><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" /></>,
  chevron: <><path d="m9 5.5 6.5 6.5L9 18.5" /></>,
  send: <><path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" /></>,
}
export const Icon = ({ name, className = '' }: { name: string; className?: string }) => <svg className={`icon ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>

/** A filled round check, the desk's green tick in a disc. */
export const Check = ({ className = 'check' }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" /><path d="m7.2 12.4 3.2 3.2 6.4-6.8" /></svg>
/** A bare green tick, for the hero and interlude cards. */
export const Tick = () => <svg className="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m2.8 8.4 3.3 3.3L13.2 4.6" /></svg>
/** A red alert disc. */
export const Alert = () => <svg className="alert" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" /><path d="M12 6.5v7M12 16.6v.4" /></svg>
/** An initials avatar in one of the desk's warm tints. */
export const Avatar = ({ initials, tone }: { initials: string; tone: 'clay' | 'honey' | 'peach' | 'chestnut' | 'sand' }) => <span className={`avatar avatar-${tone}`} aria-hidden="true">{initials}</span>
export const Arrow = () => <span aria-hidden="true" className="arrow">→</span>
