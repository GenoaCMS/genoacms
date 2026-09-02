<script lang="ts">
  import { settings } from '@genoacms/demo-support/instance'
  import { loadPage, type Outcome } from '@genoacms/demo-support/page'
  import GenoaComponent from '../genoa/GenoaComponent.svelte'
  import { provideBindings } from '../genoa/context'
  import { bindings } from '../components/bindings'

  /**
   * A SvelteKit consumer.
   *
   * Fetching and verifying is `loadPage`, identical in all four demos. Everything Svelte-shaped is
   * split in two: `src/genoa/` is the wrapper and is boilerplate, and `src/components/` is this
   * application's own — which is the distinction the four demos exist to make visible.
   *
   * **Fetched in the browser, not in `load`.** SvelteKit would happily fetch and verify this on the
   * server and send the result down — and that is exactly what must not happen here. The claim the
   * demo exists to make is that *a consumer verifies for itself*; a page that arrived already
   * verified would have had that done on its behalf by something the browser cannot check.
   *
   * Components also build DOM nodes, so rendering needs a document. Both reasons point the same way.
   */
  provideBindings(bindings)

  let outcome = $state<Outcome | undefined>(undefined)

  $effect(() => {
    void loadPage(settings(import.meta.env as Record<string, string | undefined>))
      .then(result => { outcome = result })
  })
</script>

{#if outcome === undefined}
  <p class="waiting">Fetching and verifying…</p>
{:else if outcome.ok}
  <GenoaComponent node={outcome.tree} />
{:else}
  <div class="refusal">
    <h2>{outcome.reason}</h2>
    {#if outcome.detail}<pre>{outcome.detail}</pre>{/if}
  </div>
{/if}
