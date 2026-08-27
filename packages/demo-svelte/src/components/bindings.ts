import DemoPage from './DemoPage.svelte'
import DemoSection from './DemoSection.svelte'
import DemoCard from './DemoCard.svelte'
import DemoNote from './DemoNote.svelte'
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
  demoNote: { component: DemoNote as never, props: ['text', 'order'] }
}

export { bindings }
