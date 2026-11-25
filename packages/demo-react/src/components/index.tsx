import type { ReactNode } from 'react'
import type { Bindings } from '../genoa/GenoaComponent'
import { ui } from '@genoacms/demo-support/ui'
import { SitePage, Hero, StatsBand, Stat, Marquee, Section, Grid, FeatureCard, SpeakerCard, AgendaItem, TicketTier, FaqItem, ContactCard } from './site'
import { GalaxySection } from './GalaxySection'
import { Duo } from './Duo'
import { Carousel } from './Carousel'

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
  <main className={ui.demoPage}>{body}</main>

const DemoSection = ({ heading, content }: { heading: string, content: ReactNode }): ReactNode =>
  <section className={ui.demoSection}>
    <h2 className={ui.demoSectionHeading}>{heading}</h2>
    {content}
  </section>

const DemoCard = ({ title, body }: { title: string, body: string }): ReactNode =>
  <article className={ui.demoCard}>
    <h3 className={ui.demoCardTitle}>{title}</h3>
    <p className={ui.demoCardBody}>{body}</p>
  </article>

const DemoNote = ({ text, order }: { text: string, order: number }): ReactNode =>
  <aside className={ui.demoNote}>
    <span className={ui.demoNoteOrder}>{order}</span>
    <p className={ui.demoNoteText}>{text}</p>
  </aside>

const bindings: Bindings = {
  demoPage: { component: DemoPage as never, props: ['body'] },
  demoSection: { component: DemoSection as never, props: ['heading', 'content'] },
  demoCard: { component: DemoCard as never, props: ['title', 'body'] },
  demoNote: { component: DemoNote as never, props: ['text', 'order'] },
  sitePage: { component: SitePage as never, props: ['brand', 'tagline', 'ctaLabel', 'ctaLink', 'body', 'footer'] },
  siteHero: { component: Hero as never, props: ['eyebrow', 'heading', 'lead', 'primaryLabel', 'primaryLink', 'secondaryLabel', 'secondaryLink', 'aside', 'background'] },
  siteStats: { component: StatsBand as never, props: ['stats'] },
  siteStat: { component: Stat as never, props: ['value', 'label'] },
  siteMarquee: { component: Marquee as never, props: ['text'] },
  siteSection: { component: Section as never, props: ['anchor', 'eyebrow', 'heading', 'intro', 'content'] },
  siteGalaxy: { component: GalaxySection as never, props: ['anchor', 'eyebrow', 'heading', 'intro', 'content'] },
  siteDuo: { component: Duo as never, props: ['anchor', 'startEyebrow', 'startHeading', 'startIntro', 'start', 'endEyebrow', 'endHeading', 'endIntro', 'end'] },
  siteCarousel: { component: Carousel as never, props: ['label', 'perView', 'items'] },
  siteGrid: { component: Grid as never, props: ['columns', 'items'] },
  siteFeature: { component: FeatureCard as never, props: ['tag', 'title', 'body'] },
  siteSpeaker: { component: SpeakerCard as never, props: ['name', 'role', 'photo', 'talk'] },
  siteAgendaItem: { component: AgendaItem as never, props: ['time', 'title', 'speaker', 'track'] },
  siteTicket: { component: TicketTier as never, props: ['name', 'price', 'perks', 'highlighted', 'ctaLabel', 'ctaLink'] },
  siteFaq: { component: FaqItem as never, props: ['question', 'answer'] },
  siteContact: { component: ContactCard as never, props: ['heading', 'lines', 'email', 'phone'] }
}

export { bindings, DemoPage, DemoSection, DemoCard, DemoNote }
