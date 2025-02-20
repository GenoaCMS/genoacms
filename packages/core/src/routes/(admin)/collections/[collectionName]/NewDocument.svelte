<script lang="ts">
    import { page } from '$app/stores'
    import { extractProperties } from './utils'
    import { toastError, toastSuccess } from '$lib/script/alert'
    import { superForm } from 'sveltekit-superforms'
    import { Button, Label, Modal } from 'flowbite-svelte'
    import Input from './Editor/Input.svelte'
    import Portal from '$lib/components/Portal.svelte'

    export let collectionReference
    const properties = extractProperties(collectionReference.schema.properties)
    const { form, enhance } = superForm($page.data.form, {
      dataType: 'json',
      invalidateAll: 'force',
      onUpdate ({ form }) {
        if (!form.message) return
        if (form.message.status === 'success') toastSuccess(form.message.text)
        else toastError(form.message.text)
        isModalOpen = false
      }
    })
    let isModalOpen = false
    function toggleModal () {
      isModalOpen = !isModalOpen
    }
    function updateProperty (name: string, value: unknown) {
      form.update(($form) => {
        $form[name] = value
        return $form
      })
    }
</script>

<button class="h-full flex items-center px-3" on:click={toggleModal}>
  <i class="bi bi-plus-square text-2xl text-white hover:text-warning transition-all"></i>
</button>

<Portal>
  <Modal open={isModalOpen} title="New document">
    <form action="?/createDocument" method="post" use:enhance class="p-3">
      {#each properties as property (collectionReference.schema.properties[property.name])}
        {@const type = collectionReference.schema.properties[property.name]}
        <Label>
          {property.name}:
          <Input name={property.name}
            schema={type}
            value={$form[property.name]}
            onvalue={(value) => updateProperty(property.name, value)}
          />
        </Label>
      {/each}
      <Button type="submit" color="light" class="w-full mt-2">
        Create
      </Button>
    </form>
  </Modal>
</Portal>
