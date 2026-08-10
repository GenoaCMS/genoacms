<script lang="ts">
  import CodeEditor from '$lib/components/ui/CodeEditor.svelte'
  import { changeComponentRemote } from './change.remote.js'

  interface Props {
    uid: string;
    code?: string;
    language: 'javascript';
  }
  let { uid, code = $bindable(''), language }: Props = $props()

  let formElement: HTMLFormElement
  let updateTimeout: ReturnType<typeof setTimeout>
  const enhance = changeComponentRemote.enhance(async ({ submit }) => {
    await submit()
  })

  function scheduleCodeUpdate (currentCode: string) {
    clearTimeout(updateTimeout)
    updateTimeout = setTimeout(() => {
      if (formElement) formElement.requestSubmit()
    }, 1000)
  }

  $effect(() => {
    scheduleCodeUpdate(code)
  })
</script>

<div class="flex w-full h-[93%]">
  <CodeEditor {language} bind:value={code} />
</div>

<form bind:this={formElement} {...enhance} hidden>
  <input type="hidden" name="uid" value={uid} />
  <input type="hidden" name="uncommitedCode" value={code} />
</form>
