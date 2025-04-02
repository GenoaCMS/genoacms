<script lang="ts">
  import type { Action } from 'svelte/action'
  import type * as monaco from 'monaco-editor'

  interface Props {
    language: 'markdown' | 'javascript',
    originalValue: string,
    modifiedValue: string
  }
  let { language = 'markdown', originalValue = $bindable(''), modifiedValue = $bindable('') }: Props = $props()
  let editorInstance: monaco.editor.IStandaloneDiffEditor

  const createEditor = async (node: HTMLDivElement) => {
    const monaco = await import('monaco-editor')
    const originalModel = monaco.editor.createModel(originalValue, language)
    const modifiedModel = monaco.editor.createModel(modifiedValue, language)

    editorInstance = monaco.editor.createDiffEditor(node, {
      theme: 'vs-dark',
      readOnly: true,
      minimap: {
        enabled: false
      }
    })
    editorInstance.setModel({
      original: originalModel,
      modified: modifiedModel
    })
    editorInstance.onDidUpdateDiff(() => {
      originalValue = originalModel.getValue()
      modifiedValue = modifiedModel.getValue()
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

<div use:monacoEditor class="h-full w-full"></div>
