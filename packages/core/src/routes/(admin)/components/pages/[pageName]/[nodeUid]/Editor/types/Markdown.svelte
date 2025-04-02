<script lang="ts">
  import type { AttributeData } from '$lib/script/components/page/entry/types'
  import type { MarkdownAttributeType } from '$lib/script/components/componentEntry/component/types'
  import { Button, Card, Modal } from 'flowbite-svelte'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'
  import AttributeTypeIcon from '$lib/components/components/AttributeTypeIcon.svelte'

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

<Card padding="sm" size="none" shadow={false}>
  <div class="flex">
    <div class="me-3">
      <AttributeTypeIcon type={data.type} />
    </div>
    <h3 class="text-xl pb-3">
      {data.name}
    </h3>
  </div>
  <Button color="light" onclick={toggleModal} class="w-full">
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
