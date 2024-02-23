<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import type { ComponentSchemaFile } from '$lib/script/components/componentSchema/types'

    export let schema: ComponentSchemaFile
</script>

<input type="hidden" name="schema" value={JSON.stringify(schema)}>
<CardLink type="submit" icon="box" text={schema.name} class="w-full"/>
