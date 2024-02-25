<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import type { PrebuiltComponentEntry } from '$lib/script/components/componentEntry/component/types'

    export let schema: PrebuiltComponentEntry
</script>

<input type="hidden" name="schema" value={JSON.stringify(schema)}>
<CardLink type="submit" icon="box" text={schema.name} class="w-full"/>
