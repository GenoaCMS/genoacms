<script lang="ts">
  import type { ComponentCodeChange } from '$lib/script/components/editor/types'
  import { superForm, type SuperForm } from 'sveltekit-superforms'
  import { toastError, toastSuccess } from '$lib/script/alert'
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'

  interface Props {
    changeForm: SuperForm<ComponentCodeChange>,
    language: 'javascript'
  }
  const { changeForm, language }: Props = $props()
  const { form, enhance, submit } = superForm(changeForm, {
    dataType: 'json',
    onUpdate ({ form }) {
      if (!form.message) return
      if (form.message.status === 'success') toastSuccess(form.message.text)
      else toastError(form.message.text)
    }
  })
  let code = $state($form.uncommitedCode as string || '')
  let updateTimeout: ReturnType<typeof setTimeout>

  function updateFormCode (code: string) {
    form.update(
      ($form) => {
        $form.uncommitedCode = code
        return $form
      },
      { taint: false }
    )
    submit()
  }
  function scheduleCodeUpdate (code: string) {
    clearTimeout(updateTimeout)
    updateTimeout = setTimeout(() => updateFormCode(code), 1500)
  }

  $effect(() => {
    scheduleCodeUpdate(code)
  })
</script>

<div class="flex w-full h-[93%]">
  <MonacoEditor {language} bind:value={code}/>
</div>

<form action="?/change" method="post" use:enhance hidden>
  <input type="text" name="uid" value={$form.uid}>
  <input type="text" name="uncommitedCode" value={$form.uncommitedCode} class="whitespace-pre">
</form>
