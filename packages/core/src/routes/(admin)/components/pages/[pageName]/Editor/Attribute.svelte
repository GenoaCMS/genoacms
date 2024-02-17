<script lang="ts">
    import { Select } from 'flowbite-svelte'
    import type { AttributeData } from '$lib/script/components/page/types'
    // import {JSONEditor } from '@json-editor/json-editor/src/core.js'

    const setupEditor = async () => {
      // const JSONEditor = (await import('@json-editor/json-editor/src/core.js')).default
      // console.log(JSONEditor)
    }

    export let attribute: AttributeData
    const editor = (node) => {
      setupEditor()
      // const jsonEditor = new JSONEditor(node, {
      //   theme: 'tailwind'
      // })
      console.log(node)
    }
</script>

<div use:editor>
    {attribute.name}
    {#if attribute.schema.type === 'array'}
        <Select>
            <option value="1">One</option>
        </Select>
    {/if}
</div>
