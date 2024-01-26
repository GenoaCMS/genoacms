<script lang="ts">
  import { enhance } from '$app/forms'
  import { extractProperties } from '../utils'
  import Input from '$lib/components/Input.svelte'
  import Button from '$lib/components/Button.svelte'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import { Toast } from '$lib/script/alert'

  export let data
  const properties = extractProperties(data.document.reference.collection.schema.properties)

  const enhanceUpdate = () => {
    return ({ result }) => {
      if (result.type !== 'success') {
        Toast.fire({
          title: 'Document update failed',
          icon: 'error'
        })
        return
      }
      Toast.fire({
        title: 'Document updated',
        icon: 'success'
      })
    }
  }
</script>

<TopPanel>
    <h1 class="text-2xl">
        Update <span class="text-warning">{data.document.reference.id}</span> of
        <span class="text-warning">{data.document.reference.collection.name}</span>
    </h1>
</TopPanel>

<form action="?/update" method="post" use:enhance={enhanceUpdate}>
    {#each properties as property}
        {property.name}:
        <Input name={property.name} bind:value={data.document.data[property.name]}/>
    {/each}
    <Button>
        Save
    </Button>
</form>
