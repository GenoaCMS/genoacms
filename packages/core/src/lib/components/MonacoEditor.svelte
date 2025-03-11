<script lang="ts">
  import type { Action } from 'svelte/action'
  import type * as monaco from 'monaco-editor'

  interface Props {
    language: 'markdown' | 'javascript',
    value: string,
    class?: string,
    onvalue?: (v: string) => void
  }
  let {
    language = 'markdown',
    value = $bindable(),
    class: additionalClasses = '',
    onvalue = () => {}
  }: Props = $props()
  let editorInstance: monaco.editor.IStandaloneCodeEditor

  const createEditor = async (node: HTMLDivElement) => {
    const monaco = await import('monaco-editor')

    editorInstance = monaco.editor.create(node, {
      value: value || '',
      language,
      theme: 'hc-light',
      minimap: {
        enabled: false
      }
    })
    editorInstance.onDidChangeModelContent(() => {
      const currentValue = editorInstance.getValue()
      value = currentValue
      onvalue(currentValue)
    })
  }
  const monacoEditor = (node: HTMLDivElement): Action => {
    createEditor(node)
    return {
      destroy: () => {
        editorInstance.dispose()
      }
    }
  }
</script>

<div use:monacoEditor class="h-full w-full {additionalClasses}" autofocus></div>
