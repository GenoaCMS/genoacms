import type { CSSProperties, ReactNode } from 'react'
import { columnsOf, initialsOf, linesOf } from '@genoacms/demo-support/site'

/** The conference site's components: ordinary React components that know no GenoaCMS. */

interface SitePageProps { brand: string, tagline: string, ctaLabel: string, ctaLink: string, body: ReactNode, footer: string }

const SitePage = ({ brand, tagline, ctaLabel, ctaLink, body, footer }: SitePageProps): ReactNode =>
  <>
    <header className="site-header">
      <div className="site-container site-header__inner">
        <a className="site-brand" href="#top">
          <span className="site-brand__name">{brand}</span>
          <span className="site-brand__tagline">{tagline}</span>
        </a>
        <a className="site-button" href={ctaLink}>{ctaLabel}</a>
      </div>
    </header>
    <main className="site-main" id="top">{body}</main>
    <footer className="site-footer"><div className="site-container"><p>{footer}</p></div></footer>
  </>

interface HeroProps {
  eyebrow: string, heading: string, lead: string,
  primaryLabel: string, primaryLink: string, secondaryLabel: string, secondaryLink: string,
  aside: ReactNode
}

const Hero = ({ eyebrow, heading, lead, primaryLabel, primaryLink, secondaryLabel, secondaryLink, aside }: HeroProps): ReactNode =>
  <section className="site-hero">
    <div className="site-container site-hero__grid">
      <div>
        <span className="site-hero__eyebrow">{eyebrow}</span>
        <h1 className="site-hero__heading">{heading}</h1>
        <p className="site-hero__lead">{lead}</p>
        <div className="site-hero__actions">
          <a className="site-button" href={primaryLink}>{primaryLabel}</a>
          {secondaryLabel !== '' && <a className="site-button site-button--ghost" href={secondaryLink}>{secondaryLabel}</a>}
        </div>
      </div>
      <div className="site-hero__aside">{aside}</div>
    </div>
  </section>

const StatsBand = ({ stats }: { stats: ReactNode }): ReactNode =>
  <section className="site-stats"><div className="site-container site-stats__inner">{stats}</div></section>

const Stat = ({ value, label }: { value: string, label: string }): ReactNode =>
  <div className="site-stat">
    <span className="site-stat__value">{value}</span>
    <span className="site-stat__label">{label}</span>
  </div>

const Marquee = ({ text }: { text: string }): ReactNode =>
  <div className="site-marquee" aria-label={text}>
    <div className="site-marquee__track" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <span className="site-marquee__item" key={index}>{text}</span>)}
    </div>
  </div>

interface SectionProps { anchor: string, eyebrow: string, heading: string, intro: string, content: ReactNode }

const Section = ({ anchor, eyebrow, heading, intro, content }: SectionProps): ReactNode =>
  <section className="site-section" id={anchor === '' ? undefined : anchor}>
    <div className="site-container">
      {eyebrow !== '' && <p className="site-section__eyebrow">{eyebrow}</p>}
      <h2 className="site-section__heading">{heading}</h2>
      {intro !== '' && <p className="site-section__intro">{intro}</p>}
      <div className="site-section__content">{content}</div>
    </div>
  </section>

const Grid = ({ columns, items }: { columns: number, items: ReactNode }): ReactNode =>
  <div className="site-grid" style={{ '--site-columns': columnsOf(columns) } as CSSProperties}>{items}</div>

const FeatureCard = ({ tag, title, body }: { tag: string, title: string, body: string }): ReactNode =>
  <article className="site-feature">
    {tag !== '' && <span className="site-feature__tag">{tag}</span>}
    <h3 className="site-feature__title">{title}</h3>
    <p className="site-feature__body">{body}</p>
  </article>

const SpeakerCard = ({ name, role, photo, talk }: { name: string, role: string, photo: string, talk: string }): ReactNode =>
  <article className="site-speaker">
    {photo === ''
      ? <div className="site-speaker__photo" aria-hidden="true">{initialsOf(name)}</div>
      : <img className="site-speaker__photo" src={photo} alt={name} loading="lazy" />}
    <div>
      <h3 className="site-speaker__name">{name}</h3>
      <p className="site-speaker__role">{role}</p>
    </div>
    {talk !== '' && <p className="site-speaker__talk">{talk}</p>}
  </article>

const AgendaItem = ({ time, title, speaker, track }: { time: string, title: string, speaker: string, track: string }): ReactNode =>
  <div className="site-agenda">
    <span className="site-agenda__time">{time}</span>
    <div>
      <p className="site-agenda__title">{title}</p>
      {speaker !== '' && <p className="site-agenda__speaker">{speaker}</p>}
    </div>
    {track !== '' ? <span className="site-agenda__track">{track}</span> : <span />}
  </div>

interface TicketTierProps { name: string, price: string, perks: string, highlighted: boolean, ctaLabel: string, ctaLink: string }

const TicketTier = ({ name, price, perks, highlighted, ctaLabel, ctaLink }: TicketTierProps): ReactNode =>
  <article className={highlighted ? 'site-ticket site-ticket--highlighted' : 'site-ticket'}>
    {highlighted && <span className="site-ticket__badge">Most popular</span>}
    <p className="site-ticket__name">{name}</p>
    <p className="site-ticket__price">{price}</p>
    <ul className="site-ticket__perks">{linesOf(perks).map(perk => <li key={perk}>{perk}</li>)}</ul>
    <a className={highlighted ? 'site-button' : 'site-button site-button--ghost'} href={ctaLink}>{ctaLabel}</a>
  </article>

const FaqItem = ({ question, answer }: { question: string, answer: string }): ReactNode =>
  <details className="site-faq">
    <summary>{question}</summary>
    <p>{answer}</p>
  </details>

const ContactCard = ({ heading, lines, email, phone }: { heading: string, lines: string, email: string, phone: string }): ReactNode =>
  <article className="site-contact">
    <h3 className="site-contact__heading">{heading}</h3>
    {lines !== '' && <p className="site-contact__lines">{lines}</p>}
    {email !== '' && <a className="site-contact__link" href={`mailto:${email}`}>{email}</a>}
    {phone !== '' && <a className="site-contact__link" href={`tel:${phone.replaceAll(' ', '')}`}>{phone}</a>}
  </article>

export { SitePage, Hero, StatsBand, Stat, Marquee, Section, Grid, FeatureCard, SpeakerCard, AgendaItem, TicketTier, FaqItem, ContactCard }
