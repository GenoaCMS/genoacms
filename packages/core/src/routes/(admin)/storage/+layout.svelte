<script lang="ts">
    import SelectionStore from './SelectionStore'
    import { setContext } from 'svelte'

    export let data
    const selection = SelectionStore({ maxItems: data.maxSelectionItems })
    setContext('selection', selection)
</script>

<slot/>
