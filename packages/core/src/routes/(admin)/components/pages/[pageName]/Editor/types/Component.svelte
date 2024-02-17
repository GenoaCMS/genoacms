<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import type { ComponentSchemaFile } from '$lib/script/components/componentSchema/types'
    import { createEventDispatcher } from 'svelte'

    export let schema: ComponentSchemaFile
    const dispatch = createEventDispatcher()

    const select = () => {
      dispatch('select', schema)
    }
</script>

<CardLink on:click={select} icon="box" text={schema.name}/>
