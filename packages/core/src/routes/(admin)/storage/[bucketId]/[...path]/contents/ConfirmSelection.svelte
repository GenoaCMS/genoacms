<script lang="ts">
    import type { SelectionStoreT } from '$lib/script/storage/SelectionStore'
    import type { SelectionType } from '$lib/script/storage/types'
    import { page } from '$app/stores'
    import { enhance } from '$app/forms'

    export let selection: SelectionStoreT
    export let selectionType: SelectionType
    const selectionTypeAndValueToActionAndValue = (selectionType: SelectionType, selection: Array<string>) => {
      if (selectionType === 'page-data') {
        const pageName = $page.url.searchParams.get('pageName')
        const nodeUID = $page.url.searchParams.get('nodeUID')
        const attributeUID = $page.url.searchParams.get('attributeUID')
        if (!pageName || !nodeUID || !attributeUID) return ['', '']
        const action = `/components/pages/${pageName}/${nodeUID}?/setStorageResourceValue`
        const value = JSON.stringify({
          attributeUID,
          selection
        })
        return [action, value]
      }
      return ['', '']
    }
    $: isSelecting = !!selectionType
    $: isSelectionEmpty = $selection.values.length === 0
    $: [action, value] = selectionTypeAndValueToActionAndValue(selectionType, $selection.values)
</script>

{#if isSelecting && !isSelectionEmpty}
    <form {action} method="post" use:enhance>
        <input type="hidden" name="value" {value}>
        <button class="h-full flex items-center px-3">
            <i class="bi bi-check-all text-2xl hover:text-warning transition-all"/>
        </button>
    </form>
{/if}
