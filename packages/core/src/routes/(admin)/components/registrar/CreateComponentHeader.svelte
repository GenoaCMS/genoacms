<script lang="ts">
  import { Modal, Button, Input, Label } from '$lib/components/ui/index'
  import { createComponent } from './create.remote.js'
  import { toastError, toastSuccess } from '$lib/script/alert.svelte'
  import { goto } from '$app/navigation'
  import ComponentTypeChoice from './ComponentTypeChoice.svelte'
  import type { ComponentType } from '$lib/script/components/componentHeader/component/types'

  /**
   * Registering a component.
   *
   * Both kinds are created here and **both open in the registrar**, because describing a component
   * comes before coding it. A component registered a moment ago has no attributes, so the signature
   * emitted for it has no parameters — opening the editor would put an author in front of an empty
   * function and nothing to write against. The way to the code is the link the registrar shows once
   * there is a shape to write against.
   */
  let name = $state('')
  let type = $state<ComponentType>('prebuilt')
  let isModalOpen = $state(false)
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  async function submit () {
    const result = await createComponent({ name, type })
    if (result.status !== 'success') {
      toastError(result.text)
      return
    }
    toastSuccess(result.text)
    isModalOpen = false
    goto(`registrar/${result.uid as string}`)
  }
</script>

<button
  aria-label="Register component"
  class="h-full flex items-center px-3"
  onclick={toggleModal}
>
  <i class="bi bi-file-plus text-2xl hover:text-warning transition-all"></i>
</button>

<Modal title="Register a new component" bind:open={isModalOpen}>
  <div class="w-full">
    <form
      onsubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      class="w-full space-y-3"
    >
      <Label class="text-sm">
        Component name:
        <Input type="text" class="w-full mt-1" name="name" bind:value={name} required />
      </Label>
      <ComponentTypeChoice bind:value={type} />
      <Button preset="filled" class="w-full mt-4" type="submit">Create</Button>
    </form>
  </div>
</Modal>
