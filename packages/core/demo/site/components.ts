type AttributeType = 'string' | 'text' | 'number' | 'boolean' | 'storageResource' | 'components'

interface AttributeSpec { name: string, type: AttributeType }

interface ComponentSpec {
  name: string
  type: 'prebuilt' | 'dynamic'
  attributes: readonly AttributeSpec[]
  body?: string
}

const attribute = (name: string, type: AttributeType = 'string'): AttributeSpec => ({ name, type })

const PREBUILT: readonly ComponentSpec[] = [
  { name: 'sitePage', attributes: [attribute('brand'), attribute('tagline'), attribute('ctaLabel'), attribute('ctaLink'), attribute('body', 'components'), attribute('footer', 'text')] },
  { name: 'siteHero', attributes: [attribute('eyebrow'), attribute('heading'), attribute('lead', 'text'), attribute('primaryLabel'), attribute('primaryLink'), attribute('secondaryLabel'), attribute('secondaryLink'), attribute('aside', 'components'), attribute('background', 'storageResource')] },
  { name: 'siteStats', attributes: [attribute('stats', 'components')] },
  { name: 'siteStat', attributes: [attribute('value'), attribute('label')] },
  { name: 'siteMarquee', attributes: [attribute('text')] },
  { name: 'siteSection', attributes: [attribute('anchor'), attribute('eyebrow'), attribute('heading'), attribute('intro', 'text'), attribute('content', 'components')] },
  { name: 'siteGalaxy', attributes: [attribute('anchor'), attribute('eyebrow'), attribute('heading'), attribute('intro', 'text'), attribute('content', 'components')] },
  { name: 'siteDuo', attributes: [attribute('anchor'), attribute('startEyebrow'), attribute('startHeading'), attribute('startIntro', 'text'), attribute('start', 'components'), attribute('endEyebrow'), attribute('endHeading'), attribute('endIntro', 'text'), attribute('end', 'components')] },
  { name: 'siteCarousel', attributes: [attribute('label'), attribute('perView', 'number'), attribute('items', 'components')] },
  { name: 'siteGrid', attributes: [attribute('columns', 'number'), attribute('items', 'components')] },
  { name: 'siteFeature', attributes: [attribute('tag'), attribute('title'), attribute('body', 'text')] },
  { name: 'siteSpeaker', attributes: [attribute('name'), attribute('role'), attribute('photo'), attribute('talk')] },
  { name: 'siteAgendaItem', attributes: [attribute('time'), attribute('title'), attribute('speaker'), attribute('track')] },
  { name: 'siteTicket', attributes: [attribute('name'), attribute('price'), attribute('perks', 'text'), attribute('highlighted', 'boolean'), attribute('ctaLabel'), attribute('ctaLink')] },
  { name: 'siteFaq', attributes: [attribute('question'), attribute('answer', 'text')] },
  { name: 'siteContact', attributes: [attribute('heading'), attribute('lines', 'text'), attribute('email'), attribute('phone')] }
].map(spec => ({ ...spec, type: 'prebuilt' as const }))

const DYNAMIC: readonly ComponentSpec[] = [
  { name: 'siteCountdown', body: 'countdown', attributes: [attribute('label'), attribute('target'), attribute('doneMessage')] },
  {
    name: 'siteFareEstimator',
    body: 'fareEstimator',
    attributes: [
      attribute('currency'), attribute('standardRate', 'number'), attribute('observationRate', 'number'),
      attribute('cryoDiscount', 'number'), attribute('evaFee', 'number'),
      attribute('minArea', 'number'), attribute('maxArea', 'number'), attribute('contactLink')
    ]
  },
  { name: 'siteVoyageTracker', body: 'voyageTracker', attributes: [attribute('label'), attribute('departure'), attribute('durationDays', 'number'), attribute('waypoints', 'text')] },
  { name: 'siteOpenNow', body: 'openNow', attributes: [attribute('label'), attribute('timeZone'), attribute('hours', 'text')] }
].map(spec => ({ ...spec, type: 'dynamic' as const }))

const COMPONENTS: readonly ComponentSpec[] = [...PREBUILT, ...DYNAMIC]

export { COMPONENTS }
export type { ComponentSpec, AttributeSpec, AttributeType }
