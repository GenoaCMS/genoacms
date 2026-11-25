type Value = string | number | boolean

interface NodeSpec {
  component: string
  values?: Record<string, Value>
  slots?: Record<string, readonly NodeSpec[]>
}

const node = (component: string, values: Record<string, Value> = {}, slots: Record<string, readonly NodeSpec[]> = {}): NodeSpec =>
  ({ component, values, slots })

const PAGE_NAME = 'siteHome'

const feature = (tag: string, title: string, body: string): NodeSpec => node('siteFeature', { tag, title, body })
const crew = (name: string, role: string, talk: string): NodeSpec => node('siteSpeaker', { name, role, photo: '', talk })
const waypoint = (time: string, title: string, detail: string, region: string): NodeSpec =>
  node('siteAgendaItem', { time, title, speaker: detail, track: region })
const faq = (question: string, answer: string): NodeSpec => node('siteFaq', { question, answer })

const PAGE: NodeSpec = node('sitePage', {
  brand: 'Halcyon Deep',
  tagline: 'The Core Run · 26,000 light-years',
  ctaLabel: 'Reserve a berth',
  ctaLink: '#berths',
  footer: 'Halcyon Deep and the starship Meridian are fictional, made up to demonstrate GenoaCMS. The astronomy is real.\n© 2026 Halcyon Deep Voyages. Every page here is signed by the CMS and verified in your browser.'
}, {
  body: [
    node('siteHero', {
      eyebrow: 'Launch window 21 June 2027 · Tycho Orbital Dock',
      heading: 'To the heart of the galaxy.',
      lead: 'One hundred and twelve days at warp aboard the starship Meridian, from the Orion Arm to the edge of Sagittarius A*, the black hole at the centre of the Milky Way. No crewed ship has gone this far. Two hundred and forty berths.',
      primaryLabel: 'Reserve a berth',
      primaryLink: '#berths',
      secondaryLabel: 'See the route',
      secondaryLink: '#route'
    }, {
      aside: [node('siteCountdown', { label: 'Launch window opens in', target: '2027-06-21T06:00:00Z', doneMessage: 'Meridian has left dock. The next window opens in 2029.' })]
    }),
    node('siteStats', {}, {
      stats: [
        node('siteStat', { value: '26,000', label: 'Light-years to the core' }),
        node('siteStat', { value: '112', label: 'Days at warp' }),
        node('siteStat', { value: '240', label: 'Berths' }),
        node('siteStat', { value: '4 million', label: 'Solar masses at the centre' })
      ]
    }),
    node('siteMarquee', { text: 'Orion Arm · Sagittarius Arm · Scutum–Centaurus Arm · Norma Arm · 3-kiloparsec Arm · Central Molecular Zone · Sagittarius A*' }),
    node('siteSection', {
      anchor: 'ship',
      eyebrow: 'The ship',
      heading: 'Meridian, built for the long dark',
      intro: 'Three hundred and ten metres of hull, a twin-ring warp drive and a gravity deck you will forget is there. She was built at Tycho for one voyage only.'
    }, {
      content: [node('siteGrid', { columns: 3 }, {
        items: [
          feature('Propulsion', 'Twin-ring warp drive', 'Two counter-rotating field rings fold space ahead of the hull, so the ship never moves faster than light locally. Cruise is 230 light-years a day.'),
          feature('Deck 1', 'The Long Window', 'A forty-metre observation gallery under a single sapphire pane, pointed forward for the whole voyage.'),
          feature('Shielding', 'Core-grade hull', 'The galactic centre is loud with radiation. Meridian carries a layered magnetic and water shield built for the inner three kiloparsecs.'),
          feature('Deck 4', 'Hydroponic gardens', 'Fresh food grown aboard: 1,200 m² of gardens, a bakery and a kitchen run by a chef who has cooked in orbit for eleven years.'),
          feature('Deck 6', 'Science bay', 'Spectrographs, a gravitational-wave array and open lab time for passengers. Every observation you make is archived and credited to you.'),
          feature('Hangar', 'Two survey shuttles', 'Short-range craft for excursions at the Arches Cluster and the edge of the Central Molecular Zone.')
        ]
      })]
    }),
    node('siteSection', {
      anchor: 'crew',
      eyebrow: 'Bridge & science',
      heading: 'Your crew',
      intro: 'Forty-one crew. These four will be on the bridge when we reach the core.'
    }, {
      content: [node('siteGrid', { columns: 4 }, {
        items: [
          crew('Adaeze Okafor', 'Captain, commanding officer', 'Twenty-two years in deep space, first to cross the Perseus Gap.'),
          crew('Ilja Brandt', 'Chief engineer', 'Designed the twin-ring drive and does not let anyone else tune it.'),
          crew('Dr. Saanvi Rao', 'Mission astrophysicist', 'Has studied the star S2\'s orbit around Sagittarius A* her whole career. Now she gets to watch it.'),
          crew('Dr. Mateo Quiroga', 'Ship\'s physician', 'Long-duration medicine and the person to see about warp sickness.')
        ]
      })]
    }),
    node('siteSection', {
      anchor: 'route',
      eyebrow: 'Flight plan',
      heading: 'The route',
      intro: 'Inward along the spiral arms to the galactic bulge, then a slow pass at the edge of the centre. Days are ship days from departure.'
    }, {
      content: [
        waypoint('Day 0', 'Departure from Tycho Orbital Dock', 'Clear the heliosphere at impulse, first warp jump at the Oort Cloud.', 'Orion Arm'),
        waypoint('Day 9', 'Crossing the Sagittarius Arm', 'Through the star-forming Eagle and Omega nebulae, close enough to see the Pillars from behind.', 'Sagittarius Arm'),
        waypoint('Day 31', 'The Scutum–Centaurus Arm', 'One of the galaxy\'s two major arms. Dense, young and very bright.', 'Scutum–Centaurus'),
        waypoint('Day 58', 'Norma Arm and the 3-kiloparsec Arm', 'The gas streams that feed the central bar. The sky fills with stars from here on.', 'Inner galaxy'),
        waypoint('Day 96', 'Sagittarius B2', 'A molecular cloud rich in organic molecules, including ethyl formate, which gives raspberries their flavour.', 'Central Molecular Zone'),
        waypoint('Day 104', 'Arches and Quintuplet clusters', 'The densest young star clusters in the galaxy. Shuttle excursion for those who booked it.', 'Galactic centre'),
        waypoint('Day 112', 'Station-keeping at Sagittarius A*', 'Seven days holding at a safe distance, watching the S-stars race around four million suns of darkness.', 'Galactic centre')
      ]
    }),
    node('siteSection', {
      anchor: 'berths',
      eyebrow: 'Berths',
      heading: 'Choose your berth',
      intro: 'Prices are for the round trip in credits and include all meals, shielding and the return leg. A 10% deposit holds a berth.'
    }, {
      content: [node('siteGrid', { columns: 3 }, {
        items: [
          node('siteTicket', { name: 'Crew-deck berth', price: '₡ 48,000', perks: 'Private cabin on Deck 5\nFull access to the Long Window\nSeat at the core-arrival briefing', highlighted: false, ctaLabel: 'Reserve crew-deck', ctaLink: '#passage' }),
          node('siteTicket', { name: 'Observation suite', price: '₡ 96,000', perks: 'Forward-facing suite with its own viewport\nPriority shuttle excursion at the Arches Cluster\nDinner with the captain on arrival day\nYour own observation log, archived', highlighted: true, ctaLabel: 'Reserve a suite', ctaLink: '#passage' }),
          node('siteTicket', { name: 'Science fellowship', price: '₡ 64,000', perks: 'Crew-deck berth\n120 hours of science bay time\nCo-authorship on mission papers', highlighted: false, ctaLabel: 'Apply for a fellowship', ctaLink: '#contact' })
        ]
      })]
    }),
    node('siteSection', {
      anchor: 'passage',
      eyebrow: 'Plan your passage',
      heading: 'What will it cost?',
      intro: 'Pick your cabin and extras for an instant estimate. Reservations confirm the final fare within one ship day.'
    }, {
      content: [node('siteGrid', { columns: 2 }, {
        items: [
          node('siteFareEstimator', { currency: '₡', standardRate: 2400, observationRate: 4100, cryoDiscount: 12, evaFee: 6500, minArea: 12, maxArea: 40, contactLink: '#contact' }),
          node('siteFeature', { tag: 'Every berth includes', title: 'Aboard Meridian', body: 'Pre-flight training, 21 days at Tycho\nFull radiation shielding for the core\nAll meals from the hydroponic kitchen\nAccess to the gravity deck and gym\nThe return leg: 104 days home' })
        ]
      })]
    }),
    node('siteSection', {
      anchor: 'faq',
      eyebrow: 'Questions',
      heading: 'Before you sign on'
    }, {
      content: [
        faq('How long is the whole voyage?', 'About eight months: 112 days out, 7 days at the core, and a faster 104-day return with the galaxy\'s rotation behind us.'),
        faq('Is warp travel safe?', 'Meridian\'s field never accelerates the hull itself, so you feel nothing. About one passenger in five has mild warp sickness for the first day, and Dr. Quiroga will see you through it.'),
        faq('Can we see the black hole?', 'Sagittarius A* gives off no light of its own. What you will see is the glowing gas around it and the S-stars orbiting it, some of them faster than 7,000 km/s.'),
        faq('Can I bring my family?', 'Passengers must be 16 or older. Two observation suites have connecting doors for families travelling together.')
      ]
    }),
    node('siteSection', {
      anchor: 'contact',
      eyebrow: 'Contact',
      heading: 'Talk to mission control'
    }, {
      content: [node('siteGrid', { columns: 3 }, {
        items: [
          node('siteOpenNow', { label: 'Reservations desk', timeZone: 'UTC', hours: 'mon-fri 08:00-20:00\nsat 10:00-16:00\nsun closed' }),
          node('siteContact', { heading: 'Reservations', lines: 'Berths, deposits and pre-flight training at Tycho.', email: 'berths@halcyondeep.example', phone: '+1 555 0100 2027' }),
          node('siteContact', { heading: 'Science & press', lines: 'Fellowships, research partners and media seats.', email: 'science@halcyondeep.example', phone: '+1 555 0100 2112' })
        ]
      })]
    })
  ]
})

export { PAGE, PAGE_NAME }
export type { NodeSpec, Value }
