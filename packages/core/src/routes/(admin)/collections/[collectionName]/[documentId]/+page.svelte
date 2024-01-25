<script lang="ts">
  import { enhance } from '$app/forms'
    import { extractProperties } from '../utils'
    import Input from '$lib/components/Input.svelte'
  import Button from '$lib/components/Button.svelte'

    export let data
    const properties = extractProperties(data.document.reference.collection.schema.properties)
</script>

<form action="?/update" method="post" use:enhance>
    {#each properties as property}
        {property.name}:
        <Input name={property.name} bind:value={data.document.data[property.name]}/>
    {/each}
    <Button>
        Save
    </Button>
</form>
