<script lang="ts">
    export let data
</script>

<div class="bg-dark text-warning">
    collections
</div>

{#each data.collectionReferences as collection}
    <a href="/collections/{collection.name}">{collection.name}</a>
{/each}
