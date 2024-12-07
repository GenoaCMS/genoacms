<script lang="ts">
  import { superForm } from 'sveltekit-superforms'
  import { extractProperties } from '../utils'
  import { toastSuccess, toastError } from '$lib/script/alert'
  import TopPanel from '$lib/components/TopPanel.svelte'
  import { Label } from 'flowbite-svelte'
  import Input from '../Editor/Input.svelte'
  import Delete from './Delete.svelte'
  import Update from './Update.svelte'

  export let data
  const properties = extractProperties(data.document.reference.collection.schema.properties)
  const { form, enhance } = superForm(data.form, {
    dataType: 'json',
    onUpdate ({ form }) {
      if (!form.message) return
      if (form.message.status === 'success') toastSuccess(form.message.text)
      else toastError(form.message.text)
    }
  })
</script>

<TopPanel>
  <h1 class="text-2xl">
    Update <span class="text-warning">{data.document.reference.id}</span> of
    <span class="text-warning">{data.document.reference.collection.name}</span>
  </h1>
  <svelte:fragment slot="right">
    <Delete />
    <Update />
  </svelte:fragment>
</TopPanel>

<form id="update-form" action="?/update" method="post" use:enhance class="p-3">
  {#each properties as property}
    {@const type = data.document.reference.collection.schema.properties[property.name]}
    <Label>
      {property.name}:
      <Input name={property.name}
        schema={type}
        bind:value={$form[property.name]}/>
    </Label>
  {/each}
</form>
