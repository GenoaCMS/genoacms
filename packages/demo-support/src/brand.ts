/**
 * What the four demos put in `<head>` besides their title: icons, the manifest and the share card.
 *
 * Data rather than markup, so the three Vite applications inject it with `brandAssets()` and the
 * SvelteKit one renders it with `<svelte:head>`, from one list.
 */

interface HeadTag {
  tag: 'meta' | 'link'
  attrs: Record<string, string>
}

const NAME = 'Sagittarius Line · The Core Run'
const DESCRIPTION = '112 days at warp aboard the starship Blackgazer, from Jupiter Station to Sagittarius A*, the black hole at the centre of the Milky Way. Two hundred and forty berths.'
const THEME_COLOR = '#03050c'
const SHARE_IMAGE = 'https://storage.googleapis.com/genoacms-public/sagittarius-line/share-card.jpg'
const SHARE_IMAGE_ALT = 'The Sagittarius Line wordmark over the Pillars of Creation'

const meta = (key: 'name' | 'property', value: string, content: string): HeadTag =>
  ({ tag: 'meta', attrs: { [key]: value, content } })

const link = (attrs: Record<string, string>): HeadTag => ({ tag: 'link', attrs })

const BRAND_HEAD: readonly HeadTag[] = [
  meta('name', 'description', DESCRIPTION),
  meta('name', 'theme-color', THEME_COLOR),
  meta('name', 'color-scheme', 'dark'),
  link({ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }),
  link({ rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' }),
  link({ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }),
  link({ rel: 'manifest', href: '/site.webmanifest' }),
  meta('property', 'og:type', 'website'),
  meta('property', 'og:site_name', 'Sagittarius Line'),
  meta('property', 'og:title', NAME),
  meta('property', 'og:description', DESCRIPTION),
  meta('property', 'og:image', SHARE_IMAGE),
  meta('property', 'og:image:width', '1200'),
  meta('property', 'og:image:height', '630'),
  meta('property', 'og:image:alt', SHARE_IMAGE_ALT),
  meta('name', 'twitter:card', 'summary_large_image'),
  meta('name', 'twitter:title', NAME),
  meta('name', 'twitter:description', DESCRIPTION),
  meta('name', 'twitter:image', SHARE_IMAGE),
  meta('name', 'twitter:image:alt', SHARE_IMAGE_ALT)
]

export { BRAND_HEAD }
export type { HeadTag }
