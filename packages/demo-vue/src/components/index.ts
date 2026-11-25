import DemoPage from './DemoPage.vue'
import DemoSection from './DemoSection.vue'
import DemoCard from './DemoCard.vue'
import DemoNote from './DemoNote.vue'
import SitePage from './site/SitePage.vue'
import Hero from './site/Hero.vue'
import StatsBand from './site/StatsBand.vue'
import Stat from './site/Stat.vue'
import Marquee from './site/Marquee.vue'
import Section from './site/Section.vue'
import Grid from './site/Grid.vue'
import FeatureCard from './site/FeatureCard.vue'
import SpeakerCard from './site/SpeakerCard.vue'
import AgendaItem from './site/AgendaItem.vue'
import TicketTier from './site/TicketTier.vue'
import FaqItem from './site/FaqItem.vue'
import ContactCard from './site/ContactCard.vue'
import GalaxySection from './site/GalaxySection.vue'
import Duo from './site/Duo.vue'
import Carousel from './site/Carousel.vue'
import type { Bindings } from '../genoa/GenoaComponent'

/**
 * This consumer's components — ordinary single-file Vue components, which is the point.
 *
 * They take named props and know nothing about GenoaCMS. The only GenoaCMS-shaped thing here is
 * `bindings`, which says which positional value becomes which prop.
 *
 * **`props` must match the publication's `attributeOrder`.** The signed order decides which value is
 * which; this list decides what each is called. Out of step, the right values land in the wrong props
 * with every signature valid.
 */
const bindings: Bindings = {
  demoPage: { component: DemoPage, props: ['body'] },
  demoSection: { component: DemoSection, props: ['heading', 'content'] },
  demoCard: { component: DemoCard, props: ['title', 'body'] },
  demoNote: { component: DemoNote, props: ['text', 'order'] },
  sitePage: { component: SitePage, props: ['brand', 'tagline', 'ctaLabel', 'ctaLink', 'body', 'footer'] },
  siteHero: { component: Hero, props: ['eyebrow', 'heading', 'lead', 'primaryLabel', 'primaryLink', 'secondaryLabel', 'secondaryLink', 'aside', 'background'] },
  siteStats: { component: StatsBand, props: ['stats'] },
  siteStat: { component: Stat, props: ['value', 'label'] },
  siteMarquee: { component: Marquee, props: ['text'] },
  siteSection: { component: Section, props: ['anchor', 'eyebrow', 'heading', 'intro', 'content'] },
  siteGalaxy: { component: GalaxySection, props: ['anchor', 'eyebrow', 'heading', 'intro', 'content'] },
  siteDuo: { component: Duo, props: ['anchor', 'startEyebrow', 'startHeading', 'startIntro', 'start', 'endEyebrow', 'endHeading', 'endIntro', 'end'] },
  siteCarousel: { component: Carousel, props: ['label', 'perView', 'items'] },
  siteGrid: { component: Grid, props: ['columns', 'items'] },
  siteFeature: { component: FeatureCard, props: ['tag', 'title', 'body'] },
  siteSpeaker: { component: SpeakerCard, props: ['name', 'role', 'photo', 'talk'] },
  siteAgendaItem: { component: AgendaItem, props: ['time', 'title', 'speaker', 'track'] },
  siteTicket: { component: TicketTier, props: ['name', 'price', 'perks', 'highlighted', 'ctaLabel', 'ctaLink'] },
  siteFaq: { component: FaqItem, props: ['question', 'answer'] },
  siteContact: { component: ContactCard, props: ['heading', 'lines', 'email', 'phone'] }
}

export { bindings }
