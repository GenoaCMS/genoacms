<script lang="ts">
  import MonacoEditor from '$lib/components/MonacoEditor.svelte'
  import MarkdownViewer from '$lib/components/MarkdownViewer.svelte'
  import { Checkbox, Input } from 'flowbite-svelte'
  import StorageResources from './StorageResources.svelte'

  export let name: string
  export let type: string
  export let value: string | number | boolean | Array<string>
</script>

<!-- TODO: Array<any>, Object  -->
{type}
{#if type === 'string'}
    <Input {name} bind:value/>
{:else if type === 'number'}
    <Input {name} type="number" bind:value/>
{:else if type === 'boolean'}
    <Checkbox {name} bind:checked={value}/>
{:else if type === 'markdown'}
    <input type="hidden" {name} bind:value/>
    <div class="w-full min-h-[15rem] flex border">
      <div class="w-1/2">
        <MonacoEditor bind:value/>
      </div>
      <div class="w-1/2">
        <MarkdownViewer markdown={value}/>
      </div>
    </div>
{:else if type === 'storageResources'}
  <StorageResources />
{:else if type === 'reference'}
    <Input {name} type="text" bind:value/>
{/if}
