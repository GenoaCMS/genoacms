/**
 * The site's Tailwind classes, shared by the four demos.
 *
 * Each framework writes its own markup and takes every class list from here, so the four sites stay
 * identical and a design change is made once. `styles/site.css` scans this file.
 */

const container = 'mx-auto w-full max-w-[72.5rem] px-5 sm:px-6'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal'

const buttonBase = `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 font-bold tracking-[0.02em] no-underline transition hover:-translate-y-px ${focusRing}`

const button = {
  primary: `${buttonBase} border-accent bg-accent px-5 py-3 text-[0.95rem] text-accent-ink hover:shadow-[0_10px_24px_-12px_var(--color-accent)]`,
  ghost: `${buttonBase} border-current bg-transparent px-5 py-3 text-[0.95rem] text-inherit`,
  compact: `${buttonBase} border-accent bg-accent px-4 py-2 text-sm text-accent-ink sm:px-5 sm:py-2.5 sm:text-[0.95rem]`
}

const eyebrow = 'm-0 text-xs font-extrabold uppercase tracking-[0.16em] text-accent'
const heading = 'mt-2 mb-4 font-display text-[clamp(1.75rem,5vw,3rem)] font-black uppercase leading-[1.08] text-balance'
const intro = 'mt-0 mb-10 max-w-2xl whitespace-pre-line text-ink-soft'
const card = 'rounded-card border border-line bg-surface'

const ui = {
  container,
  status: 'mx-auto my-24 grid max-w-2xl justify-items-center gap-4 px-6 text-center text-ink-soft',
  spinner: 'size-10 animate-spin rounded-full border-4 border-line border-t-accent',
  refusal: `${container} my-16 grid max-w-2xl gap-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-black [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-card [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface [&_pre]:p-4 [&_pre]:text-sm`,

  failures: `${container} my-8 text-sm text-accent`,

  skipLink: `sr-only rounded-full bg-accent px-4 py-2 font-bold text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 ${focusRing}`,
  header: 'sticky top-0 z-30 border-b border-white/5 bg-night/90 text-white backdrop-blur-md',
  headerInner: `${container} flex items-center justify-between gap-4 py-3`,
  brand: `flex min-w-0 items-baseline gap-3 rounded-md no-underline ${focusRing}`,
  brandName: 'whitespace-nowrap font-display text-[clamp(0.95rem,4vw,1.25rem)] font-black uppercase tracking-[0.06em]',
  brandTagline: 'hidden truncate text-sm text-white/70 md:inline',
  headerCta: `${button.compact} shrink-0`,
  main: 'block',
  footer: 'border-t border-line bg-night py-12 text-sm text-ink-soft',
  footerText: `${container} m-0 whitespace-pre-line`,

  hero: 'hero-art relative isolate overflow-hidden pt-14 pb-14 text-white sm:pt-24 sm:pb-20 lg:pt-32 lg:pb-24',
  heroGrid: `${container} relative grid items-center gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-12`,
  heroText: 'min-w-0',
  heroEyebrow: 'inline-block max-w-full rounded-full border border-signal/40 bg-night/40 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.12em] text-signal sm:text-xs',
  heroHeading: 'mt-5 mb-4 font-display text-[clamp(2.1rem,8.5vw,4.8rem)] font-black uppercase leading-[1.02] tracking-tight text-balance',
  heroLead: 'mt-0 mb-8 max-w-xl whitespace-pre-line text-base text-ink/85 sm:text-lg',
  heroActions: 'flex flex-wrap gap-3',
  heroAside: 'grid min-w-0 gap-4',
  buttonPrimary: button.primary,
  buttonGhost: button.ghost,

  stats: 'bg-accent text-accent-ink',
  statsInner: `${container} grid grid-cols-2 gap-x-4 gap-y-8 py-9 md:grid-cols-4`,
  stat: 'text-center',
  statValue: 'block font-display text-[clamp(1.7rem,6vw,2.8rem)] font-black leading-none',
  statLabel: 'mt-2 block text-[0.7rem] uppercase tracking-[0.1em] opacity-90 sm:text-sm',

  marquee: 'overflow-hidden border-y border-line bg-night py-4 text-signal',
  marqueeTrack: 'flex w-max animate-marquee motion-reduce:animate-none',
  marqueeItem: "whitespace-nowrap pr-12 font-display text-base font-extrabold uppercase tracking-[0.08em] after:ml-12 after:text-accent after:content-['◆'] sm:text-lg",

  section: 'scroll-mt-20 py-16 sm:py-20 lg:py-24 even:bg-[linear-gradient(180deg,var(--color-night),var(--color-paper))]',
  sectionInner: container,
  eyebrow,
  heading,
  intro,
  content: 'grid gap-6',

  duoGrid: `${container} grid gap-16 lg:grid-cols-2 lg:gap-14`,
  duoColumn: 'min-w-0',
  duoHeading: 'mt-2 mb-4 font-display text-[clamp(1.6rem,4vw,2.4rem)] font-black uppercase leading-[1.08] text-balance',
  duoIntro: 'mt-0 mb-8 max-w-2xl whitespace-pre-line text-ink-soft',

  carousel: 'grid gap-4',
  carouselTrack: 'flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden *:shrink-0 *:basis-[85%] *:snap-start sm:*:basis-(--slide-basis)',
  carouselControls: 'flex justify-end gap-2',
  carouselButton: `grid size-11 cursor-pointer place-items-center rounded-full border border-line bg-surface text-xl font-black text-accent transition hover:border-accent ${focusRing}`,

  grid: 'grid gap-6 sm:grid-cols-[repeat(min(var(--grid-columns),2),minmax(0,1fr))] lg:grid-cols-[repeat(var(--grid-columns),minmax(0,1fr))]',

  feature: `${card} h-full border-t-[3px] border-t-accent p-6 sm:p-7`,
  featureTag: 'text-xs font-extrabold uppercase tracking-[0.14em] text-accent',
  featureTitle: 'mt-2 mb-2.5 font-display text-xl font-extrabold text-balance',
  featureBody: 'm-0 whitespace-pre-line text-ink-soft',

  speaker: 'grid content-start gap-3.5',
  speakerPhoto: 'grid aspect-[4/3] w-full place-items-center rounded-card border border-line bg-[radial-gradient(circle_at_30%_25%,#2a3f7a,#0b1026_70%)] object-cover font-display text-4xl font-black tracking-[0.04em] text-accent',
  speakerName: 'm-0 font-display text-lg font-extrabold',
  speakerRole: 'm-0 text-sm text-ink-soft',
  speakerTalk: 'm-0 border-l-[3px] border-accent pl-3 text-sm',

  agenda: 'grid gap-1 border-b border-line py-5 md:grid-cols-[7rem_1fr_auto] md:items-baseline md:gap-6',
  agendaTime: 'font-display font-extrabold text-accent',
  agendaTitle: 'm-0 font-bold',
  agendaSpeaker: 'mt-0.5 mb-0 text-sm text-ink-soft',
  agendaTrack: 'justify-self-start whitespace-nowrap rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-accent',

  ticket: `${card} relative flex flex-col gap-4 p-7 sm:p-8`,
  ticketHighlighted: `${card} relative flex flex-col gap-4 border-accent bg-[linear-gradient(180deg,#1a2140,var(--color-surface))] p-7 shadow-[0_30px_70px_-30px_rgb(255_181_71/0.35)] sm:p-8 lg:-translate-y-2`,
  ticketBadge: 'absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-accent-ink',
  ticketName: 'm-0 text-sm font-extrabold uppercase tracking-[0.1em]',
  ticketPrice: 'm-0 font-display text-[2.6rem] font-black leading-none',
  ticketPerks: 'm-0 grid flex-1 list-none content-start gap-2.5 p-0',
  ticketPerk: "relative pl-6 text-[0.95rem] before:absolute before:left-0 before:font-black before:text-accent before:content-['✓']",
  ticketCta: `${button.primary} w-full`,
  ticketCtaGhost: `${button.ghost} w-full`,

  faq: `${card} group px-5 sm:px-6`,
  faqQuestion: `flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-5 font-bold [&::-webkit-details-marker]:hidden after:text-2xl after:leading-none after:text-accent after:transition-transform after:content-['+'] group-open:after:rotate-45 ${focusRing}`,
  faqAnswer: 'mt-0 mb-5 whitespace-pre-line text-ink-soft',

  contact: `${card} min-w-0 p-6 sm:p-7`,
  contactHeading: 'mt-0 mb-3 font-display text-lg font-extrabold uppercase tracking-[0.04em]',
  contactLines: 'mt-0 mb-4 whitespace-pre-line text-ink-soft',
  contactLink: `block rounded-sm font-bold text-accent no-underline [overflow-wrap:anywhere] hover:underline ${focusRing}`,

  galaxy: 'scroll-mt-20 bg-night pt-16 sm:pt-20 lg:pt-24',
  galaxyHead: container,
  galaxyStage: 'relative h-[max(40rem,92svh)] md:h-[clamp(35rem,82vh,51rem)]',
  galaxyCanvas: 'galaxy-canvas absolute inset-0 block size-full cursor-grab touch-pan-y active:cursor-grabbing',
  galaxyOverlay: `${container} pointer-events-none relative flex h-full flex-col pb-6 sm:pb-8 *:flex *:min-h-0 *:flex-1 *:flex-col`,

  demoPage: `${container} grid gap-8 py-12`,
  demoSection: `${card} grid gap-4 p-6`,
  demoSectionHeading: 'm-0 font-display text-2xl font-black',
  demoCard: `${card} p-5`,
  demoCardTitle: 'mt-0 mb-2 text-lg font-bold',
  demoCardBody: 'm-0 text-ink-soft',
  demoNote: 'flex items-start gap-3 rounded-card bg-accent/10 p-4',
  demoNoteOrder: 'grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-black text-accent-ink',
  demoNoteText: 'm-0'
}

/** The CSS width of one slide when a carousel shows `perView` at once. */
const slideBasisOf = (perView: number): string =>
  `calc((100% - ${perView - 1} * 1.5rem) / ${perView})`

export { ui, slideBasisOf }
