<script lang="ts">
  import type { JSONSchemaType } from 'ajv'
  import { superForm, type SuperForm } from 'sveltekit-superforms'
  import { extractProperties } from '../utils'
  import { toastSuccess, toastError } from '$lib/script/alert'
  import { Label } from 'flowbite-svelte'
  import Input from '../Editor/Input.svelte'
  import { formConfig } from '$lib/script/forms'

  interface Props {
    editorForm: SuperForm<unknown>,
    schema: JSONSchemaType<unknown>,
    action: '?/create' | '?/update',
    onsuccess?: () => void,
    onerror?: () => void
  }
  const { editorForm, schema, action, onsuccess = () => {}, onerror = () => {} }: Props = $props()
  const properties = $derived(extractProperties(schema.properties))
  const { form, errors, enhance } = superForm(editorForm, {
    ...formConfig,
    dataType: 'json',
    resetForm: false,
    onUpdate ({ form }) {
      if (!form.message) return
      if (form.message.status === 'success') {
        onsuccess()
        toastSuccess(form.message.text)
      } else {
        onerror()
        toastError(form.message.text)
      }
    }
  })
  function updateProperty (name: string, value: unknown) {
    form.update(($form) => {
      $form[name] = value
      return $form
    })
  }
</script>

<form id="document-form" {action} method="post" use:enhance class="p-3">
  {#each properties as property}
    {@const type = schema.properties[property.name]}
    <Label>
      {property.name}:
      <Input
        schema={type}
        value={$form[property.name]}
        onvalue={(value) => updateProperty(property.name, value)}
      />
    </Label>
  {/each}
</form>
