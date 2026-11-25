import type { CSSProperties, ReactNode } from 'react'
import { columnsOf, cssImageOf, initialsOf, linesOf } from '@genoacms/demo-support/site'
import { ui } from '@genoacms/demo-support/ui'

/** The voyage site's components: ordinary React components that know no GenoaCMS. */

const idOf = (anchor: string): string | undefined => anchor === '' ? undefined : anchor

interface SitePageProps { brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: ReactNode, footer: string }

const SitePage = ({ brand, tagline, ctaLabel, ctaLink, body, footer }: SitePageProps): ReactNode =>
  <>
    <a className={ui.skipLink} href="#content">Skip to content</a>
    <header className={ui.header} id="top">
      <div className={ui.headerInner}>
        <a className={ui.brand} href="#top">
          <span className={ui.brandName}>{brand}</span>
          <span className={ui.brandTagline}>{tagline}</span>
        </a>
        <a className={ui.headerCta} href={ctaLink}>{ctaLabel}</a>
      </div>
    </header>
    <main className={ui.main} id="content">{body}</main>
    <footer className={ui.footer}><p className={ui.footerText}>{footer}</p></footer>
  </>

interface HeroProps {
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: ReactNode
  background: readonly string[]
}

const Hero = ({ eyebrow, heading, lead, primaryLabel, primaryLink, secondaryLabel, secondaryLink, aside, background }: HeroProps): ReactNode => {
  const image = cssImageOf(background)
  return (
    <section className={ui.hero} style={image === '' ? undefined : { '--hero-image': image } as CSSProperties}>
      <div className={ui.heroGrid}>
        <div className={ui.heroText}>
          <span className={ui.heroEyebrow}>{eyebrow}</span>
          <h1 className={ui.heroHeading}>{heading}</h1>
          <p className={ui.heroLead}>{lead}</p>
          <div className={ui.heroActions}>
            <a className={ui.buttonPrimary} href={primaryLink}>{primaryLabel}</a>
            {secondaryLabel !== '' && <a className={ui.buttonGhost} href={secondaryLink}>{secondaryLabel}</a>}
          </div>
        </div>
        <div className={ui.heroAside}>{aside}</div>
      </div>
    </section>
  )
}

const StatsBand = ({ stats }: { stats: ReactNode }): ReactNode =>
  <section className={ui.stats}><div className={ui.statsInner}>{stats}</div></section>

const Stat = ({ value, label }: { value: string, label: string }): ReactNode =>
  <div className={ui.stat}>
    <span className={ui.statValue}>{value}</span>
    <span className={ui.statLabel}>{label}</span>
  </div>

const Marquee = ({ text }: { text: string }): ReactNode =>
  <div className={ui.marquee} role="img" aria-label={text}>
    <div className={ui.marqueeTrack} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <span className={ui.marqueeItem} key={index}>{text}</span>)}
    </div>
  </div>

interface SectionProps { anchor: string, eyebrow: string, heading: string, intro: string, content: ReactNode }

const Section = ({ anchor, eyebrow, heading, intro, content }: SectionProps): ReactNode =>
  <section className={ui.section} id={idOf(anchor)}>
    <div className={ui.sectionInner}>
      {eyebrow !== '' && <p className={ui.eyebrow}>{eyebrow}</p>}
      <h2 className={ui.heading}>{heading}</h2>
      {intro !== '' && <p className={ui.intro}>{intro}</p>}
      <div className={ui.content}>{content}</div>
    </div>
  </section>

const Grid = ({ columns, items }: { columns: number, items: ReactNode }): ReactNode =>
  <div className={ui.grid} style={{ '--grid-columns': columnsOf(columns) } as CSSProperties}>{items}</div>

const FeatureCard = ({ tag, title, body }: { tag: string, title: string, body: string }): ReactNode =>
  <article className={ui.feature}>
    {tag !== '' && <span className={ui.featureTag}>{tag}</span>}
    <h3 className={ui.featureTitle}>{title}</h3>
    <p className={ui.featureBody}>{body}</p>
  </article>

const SpeakerCard = ({ name, role, photo, talk }: { name: string, role: string, photo: string, talk: string }): ReactNode =>
  <article className={ui.speaker}>
    {photo === ''
      ? <div className={ui.speakerPhoto} aria-hidden="true">{initialsOf(name)}</div>
      : <img className={ui.speakerPhoto} src={photo} alt={name} loading="lazy" />}
    <div>
      <h3 className={ui.speakerName}>{name}</h3>
      <p className={ui.speakerRole}>{role}</p>
    </div>
    {talk !== '' && <p className={ui.speakerTalk}>{talk}</p>}
  </article>

const AgendaItem = ({ time, title, speaker, track }: { time: string, title: string, speaker: string, track: string }): ReactNode =>
  <div className={ui.agenda}>
    <span className={ui.agendaTime}>{time}</span>
    <div>
      <p className={ui.agendaTitle}>{title}</p>
      {speaker !== '' && <p className={ui.agendaSpeaker}>{speaker}</p>}
    </div>
    {track !== '' ? <span className={ui.agendaTrack}>{track}</span> : <span />}
  </div>

interface TicketTierProps { name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string }

const TicketTier = ({ name, price, perks, highlighted, ctaLabel, ctaLink }: TicketTierProps): ReactNode =>
  <article className={highlighted ? ui.ticketHighlighted : ui.ticket}>
    {highlighted && <span className={ui.ticketBadge}>Most popular</span>}
    <p className={ui.ticketName}>{name}</p>
    <p className={ui.ticketPrice}>{price}</p>
    <ul className={ui.ticketPerks}>{linesOf(perks).map(perk => <li className={ui.ticketPerk} key={perk}>{perk}</li>)}</ul>
    <a className={highlighted ? ui.ticketCta : ui.ticketCtaGhost} href={ctaLink}>{ctaLabel}</a>
  </article>

const FaqItem = ({ question, answer }: { question: string, answer: string }): ReactNode =>
  <details className={ui.faq}>
    <summary className={ui.faqQuestion}>{question}</summary>
    <p className={ui.faqAnswer}>{answer}</p>
  </details>

const ContactCard = ({ heading, lines, email, phone }: { heading: string, lines: string, email: string, phone: string }): ReactNode =>
  <article className={ui.contact}>
    <h3 className={ui.contactHeading}>{heading}</h3>
    {lines !== '' && <p className={ui.contactLines}>{lines}</p>}
    {email !== '' && <a className={ui.contactLink} href={`mailto:${email}`}>{email}</a>}
    {phone !== '' && <a className={ui.contactLink} href={`tel:${phone.replaceAll(' ', '')}`}>{phone}</a>}
  </article>

export { SitePage, Hero, StatsBand, Stat, Marquee, Section, Grid, FeatureCard, SpeakerCard, AgendaItem, TicketTier, FaqItem, ContactCard, idOf }
