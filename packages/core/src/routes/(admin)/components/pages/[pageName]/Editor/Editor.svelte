<script lang="ts">
    import type { ComponentNode as ComponentNodeT } from '$lib/script/components/page/types'
    import ComponentNode from './ComponentNode.svelte'

    export let contents: ComponentNodeT
</script>

<div class="h-full flex flex-col p-4">
    <div class="text-2xl">
        Contents:
    </div>
    <div class="relative flex-grow">
        <div class="absolute top-0 bottom-0 start-0 end-0">
            <ComponentNode bind:node={contents} />
        </div>
    </div>
</div>
