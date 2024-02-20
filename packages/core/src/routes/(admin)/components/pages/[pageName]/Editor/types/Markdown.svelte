<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import type { Action } from 'svelte/action'
  import { Button, Modal } from 'flowbite-svelte'
  // import { editor } from 'monaco-editor/esm/vs/editor/editor.api' // TODO: figure out import for browser and web worker

  export let data: AttributeData<string>
  let isModalOpen = false
  let mdEditor
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }

  const createEditor = async (node: HTMLDivElement) => {
    const monaco = await import('monaco-editor')
    mdEditor = monaco.editor.create(node, {
      value: data.value,
      language: 'markdown',
      theme: 'hc-light',
      minimap: {
        enabled: false
      }
    })
  }
  const markdownEditor = (node: HTMLDivElement): Action => {
    createEditor(node)
    return {
      destroy: async () => {
        mdEditor.dispose()
      }
    }
  }
  const write = () => {
    data.value = mdEditor.getValue()
  }
  $: console.log(data.value)
</script>

<Button color="black" on:click={toggleModal}>
    Open Editor
</Button>

<Modal bind:open={isModalOpen} title="Edit {data.name}" size="xl">
    <div class="h-[80vh] w-full flex flex-col">
        <div use:markdownEditor class="flex-grow"/>
        <div class="w-full flex justify-end">
            <Button color="dark" on:click={write}>
                Write
            </Button>
        </div>
    </div>
</Modal>
