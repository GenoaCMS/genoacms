<script lang="ts">
    import TopPanel from '$lib/components/TopPanel.svelte'
    import { superForm } from 'sveltekit-superforms'
    import ChangeName from './ChangeName.svelte'
    import Editor from './Editor/Editor.svelte'
    import { formConfig } from '$lib/script/forms'
    import Submit from './Submit.svelte'
    import Redo from './Redo.svelte'
    import Undo from './Undo.svelte'

        const { data } = $props()
    const { form, enhance, submit } = superForm(data.updateForm, {
      ...formConfig,
      dataType: 'json'
    })
    $inspect($form)
</script>

<TopPanel>
  <div class="text-2xl">
    Component:
    {$form.name}
  </div>
  <svelte:fragment slot="right">
    <ChangeName bind:name={$form.name} onrename={submit}/>
    <Undo />
    <Redo />
    <Submit />
  </svelte:fragment>
</TopPanel>

<form id="update-form" method="post" action="?/update" use:enhance>
  <Editor attributes={$form.attributes} />
</form>
