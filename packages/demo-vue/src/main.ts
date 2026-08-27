import { createApp, defineComponent, h, onMounted, ref } from 'vue'
import { settings } from '@genoacms/demo-support/instance'
import { loadPage, type Outcome } from '@genoacms/demo-support/page'
import { GenoaComponent } from './genoa/GenoaComponent'
import { bindings } from './components/index'

/**
 * A Vue consumer.
 *
 * Fetching and verifying is `loadPage`, identical in all four demos. Everything Vue-shaped is
 * `src/genoa/` — the wrapper, which is boilerplate — and `src/components/`, which is this
 * application's own.
 *
 * **In `onMounted`, not at build time.** The whole claim is that a consumer verifies for itself; a
 * page that arrived already rendered would have had that done for it by something it cannot check.
 */
const App = defineComponent({
  setup () {
    const outcome = ref<Outcome | undefined>(undefined)
    onMounted(() => {
      void loadPage(settings(import.meta.env as Record<string, string | undefined>))
        .then(result => { outcome.value = result })
    })

    return () => {
      const result = outcome.value
      if (result === undefined) return h('p', { class: 'waiting' }, 'Fetching and verifying…')
      if (!result.ok) {
        return h('div', { class: 'refusal' }, [
          h('h2', result.reason),
          ...(result.detail === undefined ? [] : [h('pre', result.detail)])
        ])
      }
      return h(GenoaComponent, { node: result.tree, bindings })
    }
  }
})

createApp(App).mount('#app')
