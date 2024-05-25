<script lang="ts">
    import SelectStorageObject from './SelectStorageObject.svelte'

  export let allowMutliple: boolean = false

  export let resources: Array<string> = []

  function canSelectMore(resources: Array<string>) {
      return allowMutliple || resources.length === 0
  }
</script>

{#each resources as resource}
  <SelectStorageObject {resource} {allowMutliple} />
{/each}
{#if canSelectMore(resources)}
  <SelectStorageObject {allowMutliple} />
{/if}

