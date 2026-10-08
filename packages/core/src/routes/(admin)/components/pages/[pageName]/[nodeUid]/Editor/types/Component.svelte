<script lang="ts">
    import CardLink from '$lib/components/CardLink.svelte'
    import type { ComponentHeader } from '$lib/script/components/componentHeader/component/types'

    interface Props {
      schema: ComponentHeader
    }
    const { schema }: Props = $props()
</script>

<input type="hidden" name="schema" value={JSON.stringify(schema)}>
<CardLink type="submit" icon="box" text={schema.name} class="w-full"/>
