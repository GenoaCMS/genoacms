import DemoPage from './DemoPage.svelte'
import DemoSection from './DemoSection.svelte'
import DemoCard from './DemoCard.svelte'
import DemoNote from './DemoNote.svelte'
import SitePage from './site/SitePage.svelte'
import Hero from './site/Hero.svelte'
import StatsBand from './site/StatsBand.svelte'
import Stat from './site/Stat.svelte'
import Marquee from './site/Marquee.svelte'
import Section from './site/Section.svelte'
import Grid from './site/Grid.svelte'
import FeatureCard from './site/FeatureCard.svelte'
import SpeakerCard from './site/SpeakerCard.svelte'
import AgendaItem from './site/AgendaItem.svelte'
import TicketTier from './site/TicketTier.svelte'
import FaqItem from './site/FaqItem.svelte'
import ContactCard from './site/ContactCard.svelte'
import type { Bindings } from '../genoa/context'

/**
 * This consumer's components — ordinary Svelte components, which is the point.
 *
 * They take named props and know nothing about GenoaCMS; a slot arrives as a snippet, which is what
 * a Svelte developer expects children to be. The only GenoaCMS-shaped thing here is this map.
 *
 * **`props` must match the publication's `attributeOrder`.** The signed order decides which value is
 * which; this list decides what each is called. Out of step, the right values land in the wrong props
 * with every signature valid.
 */
const bindings: Bindings = {
  demoPage: { component: DemoPage as never, props: ['body'] },
  demoSection: { component: DemoSection as never, props: ['heading', 'content'] },
  demoCard: { component: DemoCard as never, props: ['title', 'body'] },
  demoNote: { component: DemoNote as never, props: ['text', 'order'] },
  sitePage: { component: SitePage as never, props: ['brand', 'tagline', 'ctaLabel', 'ctaLink', 'body', 'footer'] },
  siteHero: { component: Hero as never, props: ['eyebrow', 'heading', 'lead', 'primaryLabel', 'primaryLink', 'secondaryLabel', 'secondaryLink', 'aside'] },
  siteStats: { component: StatsBand as never, props: ['stats'] },
  siteStat: { component: Stat as never, props: ['value', 'label'] },
  siteMarquee: { component: Marquee as never, props: ['text'] },
  siteSection: { component: Section as never, props: ['anchor', 'eyebrow', 'heading', 'intro', 'content'] },
  siteGrid: { component: Grid as never, props: ['columns', 'items'] },
  siteFeature: { component: FeatureCard as never, props: ['tag', 'title', 'body'] },
  siteSpeaker: { component: SpeakerCard as never, props: ['name', 'role', 'photo', 'talk'] },
  siteAgendaItem: { component: AgendaItem as never, props: ['time', 'title', 'speaker', 'track'] },
  siteTicket: { component: TicketTier as never, props: ['name', 'price', 'perks', 'highlighted', 'ctaLabel', 'ctaLink'] },
  siteFaq: { component: FaqItem as never, props: ['question', 'answer'] },
  siteContact: { component: ContactCard as never, props: ['heading', 'lines', 'email', 'phone'] }
}

export { bindings }
