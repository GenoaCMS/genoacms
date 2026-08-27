<script lang="ts">
  import { pagesPinningComponent } from '$lib/script/components/dependents.remote'

  /**
   * What deleting this component would break, shown inside the confirmation.
   *
   * **R6 accepts that deletion breaks pinned pages; this is Q4's answer.** The break is silent
   * everywhere else: a published tree goes on naming a publication that is no longer there, and a
   * consumer resolving that pin gets nothing back — indistinguishable from a component that never
   * existed or a bucket it cannot reach. Nobody is notified and the page renders short.
   *
   * So the cost is turned into an informed one at the only moment it can be: before the author
   * confirms. It does not *prevent* the deletion, which is R6's decision and not this component's to
   * revisit.
   *
   * ## Three states, and none of them is a blank space
   *
   * - **Pages depend on it.** Named, with how many nodes each loses, because one component may be
   *   placed in a page more than once and "half the page goes" is a different decision from "one
   *   card goes".
   * - **Nothing depends on it.** Said, not left blank. A dialog that shows nothing where a warning
   *   would go reads as a dialog that has not finished loading.
   * - **Something could not be read.** A page whose tree does not verify is not a page depending on
   *   nothing; it is a page nobody can answer for. Reporting it as safe would be the one wrong
   *   answer, so it gets its own heading.
   */
  const { uid }: { uid: string } = $props()

  const dependents = $derived(pagesPinningComponent(uid))
</script>

<div class="mb-3">
  {#await dependents}
    <p class="text-sm opacity-70">Checking which pages use this component…</p>
  {:then result}
    {#if result.status === 'fail'}
      <p class="text-sm text-warning-500">
        Could not check which pages use this component: {result.text}
      </p>
    {:else}
      {#if result.pages.length > 0}
        <p class="text-sm text-error-500 mb-1">
          {result.pages.length === 1 ? '1 published page uses' : `${result.pages.length} published pages use`}
          this component. Deleting it will leave
          {result.pages.length === 1 ? 'that page' : 'those pages'} unable to render it, and visitors
          will see nothing where it stood.
        </p>
        <ul class="text-sm list-disc ps-5">
          {#each result.pages as page (page.name)}
            <li>
              {page.name}
              <span class="opacity-70">
                ({page.nodes === 1 ? '1 place' : `${page.nodes} places`})
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm opacity-70">No published page uses this component.</p>
      {/if}

      {#if result.unreadable.length > 0}
        <p class="text-sm text-warning-500 mt-2">
          {result.unreadable.length === 1 ? '1 published page could' : `${result.unreadable.length} published pages could`}
          not be read, so
          {result.unreadable.length === 1 ? 'it may use' : 'they may use'}
          this component without appearing above:
          {result.unreadable.join(', ')}
        </p>
      {/if}
    {/if}
  {:catch}
    <p class="text-sm text-warning-500">
      Could not check which pages use this component.
    </p>
  {/await}
</div>
