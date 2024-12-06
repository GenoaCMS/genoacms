<script lang="ts">
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'
  import { Button, ButtonGroup, Checkbox, Input, InputAddon, Textarea } from 'flowbite-svelte'
  import StorageResources from './StorageResource/StorageResources.svelte'

  export let name: string
  export let schema: JSONSchemaType<any>
  export let value: undefined | string | number | boolean | Array<string>

  function generateUUID () {
    value = crypto.randomUUID()
  }
  function addItem () {
    value = [...(value || []), '']
  }
</script>

<!-- TODO: Array<any>, Object  -->
{#if schema.type === 'string' && schema.format === 'uuid'}
    <ButtonGroup class="w-full">
      <InputAddon>
          <button type="button" on:click={generateUUID}><i class="bi bi-dice-5-fill"></i></button>
      </InputAddon>
      <Input {name} bind:value/>
    </ButtonGroup>
{:else if schema.type === 'string' && schema.format === 'text'}
    <Textarea {name} bind:value/>
{:else if schema.type === 'string' && schema.format === 'markdown'}
    <input type="hidden" {name} bind:value/>
    <div class="w-full min-h-[15rem] flex border">
      <div class="w-1/2">
        <MonacoEditor bind:value/>
      </div>
      <div class="w-1/2">
        <MarkdownViewer markdown={value}/>
      </div>
    </div>
{:else if schema.type === 'string' && schema.format === 'reference'}
    <Input {name} type="text" bind:value/>
{:else if schema.type === 'string'}
    <Input {name} bind:value/>
{:else if schema.type === 'number'}
    <Input {name} type="number" bind:value/>
{:else if schema.type === 'boolean'}
    <Checkbox {name} bind:checked={value}/>
{:else if schema.type === 'array' && schema.format === 'storageResources'}
    <StorageResources {name} resources={value}/>
{:else if schema.type === 'array'}
  {#each value || [] as item}
    <div class="mt-1">
      <svelte:self name="{name}" schema={schema.items} value={item}/>
    </div>
  {/each}
  <div class="w-full flex mt-3">
    <Button on:click={addItem} class="ms-auto" color="blue"><i class="bi bi-plus text-lg"></i></Button>
  </div>
{/if}
