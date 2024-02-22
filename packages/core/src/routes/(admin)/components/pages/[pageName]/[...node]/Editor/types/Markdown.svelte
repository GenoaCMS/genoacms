<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/types'
  import { Button, Modal } from 'flowbite-svelte'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  export let data: AttributeData<string>
  let isModalOpen = false
  const toggleModal = () => {
    isModalOpen = !isModalOpen
  }
</script>

<Button color="black" on:click={toggleModal}>
    Open Editor
</Button>

<Modal bind:open={isModalOpen} title="Edit {data.name}" size="xl">
    <div class="h-[80vh] w-full flex">
        <div class="w-1/2">
            <MonacoEditor language="markdown" bind:value={data.value} />
        </div>
        <div class="w-1/2">
            <MarkdownViewer markdown={data.value} />
        </div>
    </div>
</Modal>
