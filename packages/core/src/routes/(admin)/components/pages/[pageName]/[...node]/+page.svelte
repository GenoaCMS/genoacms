<script lang="ts">
    import ComponentNode from './Editor/ComponentNode.svelte'

    export let data
</script>

<div class="h-full flex flex-col p-4">
    <div class="text-2xl">
        Contents:
    </div>
    <div class="relative flex-grow">
        <div class="absolute top-0 bottom-0 start-0 end-0">
            <ComponentNode bind:node={data.node} />
        </div>
    </div>
</div>
