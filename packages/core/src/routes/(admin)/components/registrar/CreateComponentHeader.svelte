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
   * Both kinds are created here. A dynamic one is opened in the editor rather than the registrar,
   * because its next step is writing it — the registrar page has nothing more to offer until there
   * is code to describe.
   */
  let name = $state('')
  let type = $state<ComponentType>('prebuilt')
  let isModalOpen = $state(false)
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  const createdComponentURL = (uid: string): string =>
    type === 'dynamic' ? `../components/editor/${uid}` : `registrar/${uid}`

  async function submit () {
    const result = await createComponent({ name, type })
    if (result.status !== 'success') {
      toastError(result.text)
      return
    }
    toastSuccess(result.text)
    isModalOpen = false
    goto(createdComponentURL(result.uid as string))
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
