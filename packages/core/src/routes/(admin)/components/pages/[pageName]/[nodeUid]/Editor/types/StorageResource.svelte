<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { StorageResourceAttributeType } from '$lib/script/components/componentHeader/component/types'
  import type {
    StorageResourceValue,
    StorageResourcesAttributeValue
  } from '$lib/script/components/componentHeader/attribute/types'
  import type { SelectionInitData } from '$lib/script/storage/SelectActionRune.svelte'
  import type { SelectionParameters } from '$lib/script/storage/SelectionRune.svelte'
  import { Card } from '$lib/components/ui/index'
  import { ITC } from '$lib/script/utils'
  import { onDestroy } from 'svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

  /**
   * Choosing the files a storage-resource attribute holds.
   *
   * **A list, because the attribute is one.** Its meta-schema is `type: 'array'` with `minItems` and
   * `maxItems`, and a single-valued attribute is expressible as `maxItems: 1`. This control used to
   * hold one reference and pass `maxItems: 1` to the picker regardless of what the component asked
   * for, so an attribute declaring room for three could only ever be given one.
   *
   * The picker returns the whole selection, so choosing replaces the list rather than appending to
   * it. That matches what the storage browser shows: the author sees everything they have selected
   * and confirms it in one act.
   *
   * **Selection happens in another window.** The storage browser opens as a separate page and
   * answers over `ITC`, which is why the value arrives in a callback rather than from an event on an
   * element here. The contract lives in `SelectActionRune`; this file imported it from a
   * `SelectionStore` module that no longer exists, so the request it sent was unchecked.
   */

  interface Props {
    data: AttributeData<StorageResourceAttributeType>,
    onvalue: (v: StorageResourcesAttributeValue) => void
  }
  const { data, onvalue }: Props = $props()

  const selectionId = crypto.randomUUID()
  const itc = new ITC(selectionId)
  const selectHref = `/storage?selectionId=${selectionId}`

  /** What the attribute holds. An attribute an author has not filled in has an empty list. */
  const resources = $derived(data.value ?? [])

  itc.on('selectionInit', async () => {
    const initData: SelectionInitData<StorageResourceValue, Partial<SelectionParameters>> = {
      // What the component asked for, rather than one. An absent `maxItems` is no limit.
      parameters: { maxItems: data.schema.maxItems },
      defaultValue: resources.length > 0 ? resources : undefined
    }
    itc.send('selectionInitData', initData)

    const selection = await itc.once('selectionDone') as StorageResourcesAttributeValue
    data.value = selection
    // Both, as every other attribute control does. Writing to `data.value` alone did reach the
    // parent, because the node it passes down is a deep `$state` proxy — but that made the save
    // depend on how the parent happens to hold its state, while the parent was passing an `onvalue`
    // this control ignored.
    onvalue(selection)
    itc.send('selectionKill')
  })

  onDestroy(() => {
    itc.close()
  })
</script>

<a href={selectHref} target="_blank">
  <Card class="p-4">
    <div class="flex">
      <div class="me-3">
        <AttributeTypeIcon type={data.type} />
      </div>
      <h3 class="text-xl pb-3">
        {data.name}
      </h3>
    </div>
    {#if resources.length > 0}
      {#each resources as resource (`${resource.bucket}/${resource.name}`)}
        <div>
          Bucket: {resource.bucket}<br>
          Filename: {resource.name}
        </div>
      {/each}
    {:else}
      No file selected yet
    {/if}
  </Card>
</a>
