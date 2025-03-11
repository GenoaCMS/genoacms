<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { MarkdownAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Button, Card, Modal } from 'flowbite-svelte'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'

  interface Props {
    data: AttributeData<MarkdownAttributeType>,
    onvalue: (v: string) => void
  }
  const { data, onvalue }: Props = $props()

  let isModalOpen = $state(false)

  function toggleModal () {
    isModalOpen = !isModalOpen
  }
</script>

<Card padding="sm" size="none">
    <h3 class="text-xl pb-3">
        {data.name}
    </h3>
    <Button color="light" on:click={toggleModal} class="w-full">
        Open markdown editor
    </Button>
</Card>

<Modal bind:open={isModalOpen} title="Edit {data.name}" size="xl"
       bodyClass="p-0">
    <div class="h-[80vh] w-full flex">
        <div class="w-1/2 border-e">
            <MonacoEditor language="markdown" value={data.value} {onvalue}/>
        </div>
        <div class="w-1/2 p-4">
            <MarkdownViewer markdown={data.value} />
        </div>
    </div>
</Modal>
