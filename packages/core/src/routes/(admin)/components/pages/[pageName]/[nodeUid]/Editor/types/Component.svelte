<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import type { ComponentEntry } from '$lib/script/components/componentEntry/component/types'

    export let schema: ComponentEntry
</script>

<input type="hidden" name="schema" value={JSON.stringify(schema)}>
<CardLink type="submit" icon="box" text={schema.name} class="w-full"/>
