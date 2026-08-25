<script lang="ts">
  import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  /**
   * A component's attributes, read rather than edited.
   *
   * **In `attributeOrder`, not in whatever order the record happens to iterate.** The order is what a
   * consumer calls the component's parameters in, so a list that showed them in another order would
   * be describing a different component than the one that runs.
   */
  interface Props {
    header: ComponentHeader
  }
  const { header }: Props = $props()

  const attributes = $derived(
    header.attributeOrder
      .map(reference => header.attributes[reference])
      .filter(attribute => attribute !== undefined)
  )
</script>

{#if attributes.length === 0}
  <p class="p-4 text-center opacity-70">
    This component accepts nothing yet. Publishing its code is what fills this in.
  </p>
{:else}
  <ul class="space-y-2">
    {#each attributes as attribute (attribute.uid)}
      <li class="flex items-center gap-3 p-3 rounded border border-surface-500/40">
        <AttributeTypeIcon type={attribute.type} />
        <span class="font-medium">{attribute.name}</span>
        <span class="text-sm opacity-70 ms-auto">{attribute.type}</span>
      </li>
    {/each}
  </ul>
{/if}
