import type { ReactNode } from 'react'
import type { Bindings } from '../genoa/GenoaComponent'

/**
 * This consumer's components — ordinary React components, which is the point.
 *
 * They take **named props** and know nothing about GenoaCMS. A React developer writes these the way
 * they write anything else: hooks, state, context, all of it available. The only GenoaCMS-shaped
 * thing in this file is `bindings`, which says which positional value becomes which prop.
 *
 * **`props` must match the publication's `attributeOrder`.** The signed order decides which value is
 * which; this list decides what each is called here. Get the two out of step and the right values
 * land in the wrong props, with every signature still valid — the same hazard every consumer of a
 * positional contract has, and the reason the mapping is written down in one place rather than
 * spread through the components.
 */

const DemoPage = ({ body }: { body: ReactNode }): ReactNode =>
  <main className="page">{body}</main>

const DemoSection = ({ heading, content }: { heading: string, content: ReactNode }): ReactNode =>
  <section className="section">
    <h2 className="section-heading">{heading}</h2>
    {content}
  </section>

const DemoCard = ({ title, body }: { title: string, body: string }): ReactNode =>
  <article className="card">
    <h3 className="card-title">{title}</h3>
    <p className="card-body">{body}</p>
  </article>

const DemoNote = ({ text, order }: { text: string, order: number }): ReactNode =>
  <aside className="note">
    <span className="note-order">{order}</span>
    <p className="note-text">{text}</p>
  </aside>

const bindings: Bindings = {
  demoPage: { component: DemoPage as never, props: ['body'] },
  demoSection: { component: DemoSection as never, props: ['heading', 'content'] },
  demoCard: { component: DemoCard as never, props: ['title', 'body'] },
  demoNote: { component: DemoNote as never, props: ['text', 'order'] }
}

export { bindings, DemoPage, DemoSection, DemoCard, DemoNote }
