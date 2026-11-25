import { columnsOf, cssImageOf, initialsOf, linesOf, perViewOf, turnCarousel } from '@genoacms/demo-support/site'
import { slideBasisOf, ui } from '@genoacms/demo-support/ui'
import { galaxy } from '../galaxy'

/** The voyage site's components, as plain functions taking their values positionally. */

type Child = Node | string

const element = (tag: string, className: string, ...children: Child[]): HTMLElement => {
  const node = document.createElement(tag)
  if (className !== '') node.className = className
  node.append(...children)
  return node
}

const link = (className: string, href: string, label: string): HTMLElement => {
  const anchor = element('a', className, label)
  anchor.setAttribute('href', href)
  return anchor
}

const optional = (present: boolean, build: () => Node): Node[] => present ? [build()] : []

const withId = <T extends HTMLElement>(node: T, id: string): T => {
  if (id !== '') node.id = id
  return node
}

const sitePage = (brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: readonly Node[], footer: string): Node => {
  const brandLink = link(ui.brand, '#top', '')
  brandLink.append(element('span', ui.brandName, brand), element('span', ui.brandTagline, tagline))
  const page = document.createDocumentFragment()
  page.append(
    link(ui.skipLink, '#content', 'Skip to content'),
    withId(element('header', ui.header, element('div', ui.headerInner, brandLink, link(ui.headerCta, ctaLink, ctaLabel))), 'top'),
    withId(element('main', ui.main, ...body), 'content'),
    element('footer', ui.footer, element('p', ui.footerText, footer))
  )
  return page
}

const siteHero = (
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: readonly Node[], background: readonly string[]
): Node => {
  const image = cssImageOf(background)
  const hero = element('section', ui.hero,
    element('div', ui.heroGrid,
      element('div', ui.heroText,
        element('span', ui.heroEyebrow, eyebrow),
        element('h1', ui.heroHeading, heading),
        element('p', ui.heroLead, lead),
        element('div', ui.heroActions,
          link(ui.buttonPrimary, primaryLink, primaryLabel),
          ...optional(secondaryLabel !== '', () => link(ui.buttonGhost, secondaryLink, secondaryLabel)))),
      element('div', ui.heroAside, ...aside)))
  if (image !== '') hero.style.setProperty('--hero-image', image)
  return hero
}

const siteStats = (stats: readonly Node[]): Node =>
  element('section', ui.stats, element('div', ui.statsInner, ...stats))

const siteStat = (value: string, label: string): Node =>
  element('div', ui.stat, element('span', ui.statValue, value), element('span', ui.statLabel, label))

const siteMarquee = (text: string): Node => {
  const track = element('div', ui.marqueeTrack, ...Array.from({ length: 8 }, () => element('span', ui.marqueeItem, text)))
  track.setAttribute('aria-hidden', 'true')
  const marquee = element('div', ui.marquee, track)
  marquee.setAttribute('role', 'img')
  marquee.setAttribute('aria-label', text)
  return marquee
}

const siteSection = (anchor: string, eyebrow: string, heading: string, intro: string, content: readonly Node[]): Node =>
  withId(element('section', ui.section,
    element('div', ui.sectionInner,
      ...optional(eyebrow !== '', () => element('p', ui.eyebrow, eyebrow)),
      element('h2', ui.heading, heading),
      ...optional(intro !== '', () => element('p', ui.intro, intro)),
      element('div', ui.content, ...content))), anchor)

const siteGalaxy = (anchor: string, eyebrow: string, heading: string, intro: string, content: readonly Node[]): Node => {
  const canvas = element('canvas', ui.galaxyCanvas) as HTMLCanvasElement
  galaxy.mount(canvas)
  return withId(element('section', ui.galaxy,
    element('div', ui.galaxyHead,
      ...optional(eyebrow !== '', () => element('p', ui.eyebrow, eyebrow)),
      element('h2', ui.heading, heading),
      ...optional(intro !== '', () => element('p', ui.intro, intro))),
    element('div', ui.galaxyStage, canvas, element('div', ui.galaxyOverlay, ...content))), anchor)
}

const duoColumn = (eyebrow: string, heading: string, intro: string, content: readonly Node[]): Node =>
  element('div', ui.duoColumn,
    ...optional(eyebrow !== '', () => element('p', ui.eyebrow, eyebrow)),
    element('h2', ui.duoHeading, heading),
    ...optional(intro !== '', () => element('p', ui.duoIntro, intro)),
    element('div', ui.content, ...content))

const siteDuo = (
  anchor: string,
  startEyebrow: string, startHeading: string, startIntro: string, start: readonly Node[],
  endEyebrow: string, endHeading: string, endIntro: string, end: readonly Node[]
): Node =>
  withId(element('section', ui.section,
    element('div', ui.duoGrid,
      duoColumn(startEyebrow, startHeading, startIntro, start),
      duoColumn(endEyebrow, endHeading, endIntro, end))), anchor)

const carouselButton = (track: HTMLElement, label: string, symbol: string, direction: 1 | -1): Node => {
  const button = element('button', ui.carouselButton, symbol)
  button.setAttribute('type', 'button')
  button.setAttribute('aria-label', label)
  button.addEventListener('click', () => turnCarousel(track, direction))
  return button
}

const siteCarousel = (label: string, perView: number, items: readonly Node[]): Node => {
  const track = element('div', ui.carouselTrack, ...items)
  track.style.setProperty('--slide-basis', slideBasisOf(perViewOf(perView)))
  const carousel = element('div', ui.carousel,
    track,
    element('div', ui.carouselControls,
      carouselButton(track, 'Previous', '‹', -1),
      carouselButton(track, 'Next', '›', 1)))
  carousel.setAttribute('role', 'region')
  carousel.setAttribute('aria-roledescription', 'carousel')
  carousel.setAttribute('aria-label', label)
  return carousel
}

const siteGrid = (columns: number, items: readonly Node[]): Node => {
  const grid = element('div', ui.grid, ...items)
  grid.style.setProperty('--grid-columns', String(columnsOf(columns)))
  return grid
}

const siteFeature = (tag: string, title: string, body: string): Node =>
  element('article', ui.feature,
    ...optional(tag !== '', () => element('span', ui.featureTag, tag)),
    element('h3', ui.featureTitle, title),
    element('p', ui.featureBody, body))

const speakerPhoto = (name: string, photo: string): Node => {
  if (photo === '') {
    const placeholder = element('div', ui.speakerPhoto, initialsOf(name))
    placeholder.setAttribute('aria-hidden', 'true')
    return placeholder
  }
  const image = element('img', ui.speakerPhoto) as HTMLImageElement
  image.src = photo
  image.alt = name
  image.loading = 'lazy'
  return image
}

const siteSpeaker = (name: string, role: string, photo: string, talk: string): Node =>
  element('article', ui.speaker,
    speakerPhoto(name, photo),
    element('div', '', element('h3', ui.speakerName, name), element('p', ui.speakerRole, role)),
    ...optional(talk !== '', () => element('p', ui.speakerTalk, talk)))

const siteAgendaItem = (time: string, title: string, speaker: string, track: string): Node =>
  element('div', ui.agenda,
    element('span', ui.agendaTime, time),
    element('div', '',
      element('p', ui.agendaTitle, title),
      ...optional(speaker !== '', () => element('p', ui.agendaSpeaker, speaker))),
    track !== '' ? element('span', ui.agendaTrack, track) : element('span', ''))

const siteTicket = (name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string): Node =>
  element('article', highlighted ? ui.ticketHighlighted : ui.ticket,
    ...optional(highlighted, () => element('span', ui.ticketBadge, 'Most popular')),
    element('p', ui.ticketName, name),
    element('p', ui.ticketPrice, price),
    element('ul', ui.ticketPerks, ...linesOf(perks).map(perk => element('li', ui.ticketPerk, perk))),
    link(highlighted ? ui.ticketCta : ui.ticketCtaGhost, ctaLink, ctaLabel))

const siteFaq = (question: string, answer: string): Node =>
  element('details', ui.faq, element('summary', ui.faqQuestion, question), element('p', ui.faqAnswer, answer))

const siteContact = (heading: string, lines: string, email: string, phone: string): Node =>
  element('article', ui.contact,
    element('h3', ui.contactHeading, heading),
    ...optional(lines !== '', () => element('p', ui.contactLines, lines)),
    ...optional(email !== '', () => link(ui.contactLink, `mailto:${email}`, email)),
    ...optional(phone !== '', () => link(ui.contactLink, `tel:${phone.replaceAll(' ', '')}`, phone)))

export {
  sitePage, siteHero, siteStats, siteStat, siteMarquee, siteSection, siteGalaxy, siteDuo, siteCarousel, siteGrid,
  siteFeature, siteSpeaker, siteAgendaItem, siteTicket, siteFaq, siteContact
}
