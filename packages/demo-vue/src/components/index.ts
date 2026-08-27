import DemoPage from './DemoPage.vue'
import DemoSection from './DemoSection.vue'
import DemoCard from './DemoCard.vue'
import DemoNote from './DemoNote.vue'
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
  demoNote: { component: DemoNote, props: ['text', 'order'] }
}

export { bindings }
