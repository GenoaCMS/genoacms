import { columnsOf, initialsOf, linesOf } from '@genoacms/demo-support/site'

/** The conference site's components, as plain functions taking their values positionally. */

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

const sitePage = (brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: readonly Node[], footer: string): Node => {
  const brandLink = link('site-brand', '#top', '')
  brandLink.append(element('span', 'site-brand__name', brand), element('span', 'site-brand__tagline', tagline))
  const main = element('main', 'site-main', ...body)
  main.id = 'top'
  const page = document.createDocumentFragment()
  page.append(
    element('header', 'site-header',
      element('div', 'site-container site-header__inner', brandLink, link('site-button', ctaLink, ctaLabel))),
    main,
    element('footer', 'site-footer', element('div', 'site-container', element('p', '', footer)))
  )
  return page
}

const siteHero = (
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: readonly Node[]
): Node =>
  element('section', 'site-hero',
    element('div', 'site-container site-hero__grid',
      element('div', '',
        element('span', 'site-hero__eyebrow', eyebrow),
        element('h1', 'site-hero__heading', heading),
        element('p', 'site-hero__lead', lead),
        element('div', 'site-hero__actions',
          link('site-button', primaryLink, primaryLabel),
          ...optional(secondaryLabel !== '', () => link('site-button site-button--ghost', secondaryLink, secondaryLabel)))),
      element('div', 'site-hero__aside', ...aside)))

const siteStats = (stats: readonly Node[]): Node =>
  element('section', 'site-stats', element('div', 'site-container site-stats__inner', ...stats))

const siteStat = (value: string, label: string): Node =>
  element('div', 'site-stat', element('span', 'site-stat__value', value), element('span', 'site-stat__label', label))

const siteMarquee = (text: string): Node => {
  const track = element('div', 'site-marquee__track', ...Array.from({ length: 8 }, () => element('span', 'site-marquee__item', text)))
  track.setAttribute('aria-hidden', 'true')
  const marquee = element('div', 'site-marquee', track)
  marquee.setAttribute('aria-label', text)
  return marquee
}

const siteSection = (anchor: string, eyebrow: string, heading: string, intro: string, content: readonly Node[]): Node => {
  const section = element('section', 'site-section',
    element('div', 'site-container',
      ...optional(eyebrow !== '', () => element('p', 'site-section__eyebrow', eyebrow)),
      element('h2', 'site-section__heading', heading),
      ...optional(intro !== '', () => element('p', 'site-section__intro', intro)),
      element('div', 'site-section__content', ...content)))
  if (anchor !== '') section.id = anchor
  return section
}

const siteGrid = (columns: number, items: readonly Node[]): Node => {
  const grid = element('div', 'site-grid', ...items)
  grid.style.setProperty('--site-columns', String(columnsOf(columns)))
  return grid
}

const siteFeature = (tag: string, title: string, body: string): Node =>
  element('article', 'site-feature',
    ...optional(tag !== '', () => element('span', 'site-feature__tag', tag)),
    element('h3', 'site-feature__title', title),
    element('p', 'site-feature__body', body))

const speakerPhoto = (name: string, photo: string): Node => {
  if (photo === '') {
    const placeholder = element('div', 'site-speaker__photo', initialsOf(name))
    placeholder.setAttribute('aria-hidden', 'true')
    return placeholder
  }
  const image = element('img', 'site-speaker__photo') as HTMLImageElement
  image.src = photo
  image.alt = name
  image.loading = 'lazy'
  return image
}

const siteSpeaker = (name: string, role: string, photo: string, talk: string): Node =>
  element('article', 'site-speaker',
    speakerPhoto(name, photo),
    element('div', '', element('h3', 'site-speaker__name', name), element('p', 'site-speaker__role', role)),
    ...optional(talk !== '', () => element('p', 'site-speaker__talk', talk)))

const siteAgendaItem = (time: string, title: string, speaker: string, track: string): Node =>
  element('div', 'site-agenda',
    element('span', 'site-agenda__time', time),
    element('div', '',
      element('p', 'site-agenda__title', title),
      ...optional(speaker !== '', () => element('p', 'site-agenda__speaker', speaker))),
    track !== '' ? element('span', 'site-agenda__track', track) : element('span', ''))

const siteTicket = (name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string): Node =>
  element('article', highlighted ? 'site-ticket site-ticket--highlighted' : 'site-ticket',
    ...optional(highlighted, () => element('span', 'site-ticket__badge', 'Most popular')),
    element('p', 'site-ticket__name', name),
    element('p', 'site-ticket__price', price),
    element('ul', 'site-ticket__perks', ...linesOf(perks).map(perk => element('li', '', perk))),
    link(highlighted ? 'site-button' : 'site-button site-button--ghost', ctaLink, ctaLabel))

const siteFaq = (question: string, answer: string): Node =>
  element('details', 'site-faq', element('summary', '', question), element('p', '', answer))

const siteContact = (heading: string, lines: string, email: string, phone: string): Node =>
  element('article', 'site-contact',
    element('h3', 'site-contact__heading', heading),
    ...optional(lines !== '', () => element('p', 'site-contact__lines', lines)),
    ...optional(email !== '', () => link('site-contact__link', `mailto:${email}`, email)),
    ...optional(phone !== '', () => link('site-contact__link', `tel:${phone.replaceAll(' ', '')}`, phone)))

export {
  sitePage, siteHero, siteStats, siteStat, siteMarquee, siteSection, siteGrid,
  siteFeature, siteSpeaker, siteAgendaItem, siteTicket, siteFaq, siteContact
}
