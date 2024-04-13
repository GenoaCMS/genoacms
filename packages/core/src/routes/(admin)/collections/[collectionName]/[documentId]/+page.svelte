<script lang="ts">
  import { enhance } from '$app/forms'
  import { extractProperties } from '../utils'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import { Toast } from '$lib/script/alert'
  import { Label } from 'flowbite-svelte'
  import Input from '../Editor/Input.svelte'

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
    <svelte:fragment slot="right">
        <button type="submit" form="update-form" class="h-full flex items-center px-3">
            <i class="bi bi-floppy text-2xl hover:text-warning transition-all"/>
        </button>
    </svelte:fragment>
</TopPanel>

<form id="update-form" action="?/update" method="post" use:enhance={enhanceUpdate} class="p-3">
    {#each properties as property}
      <Label>
          {property.name}:
          <Input name={property.name} type={property.format || property.type} value={data.document.data[property.name]}/>
      </Label>
    {/each}
</form>
