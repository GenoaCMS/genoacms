<script lang="ts">
  import { EditorState } from '@codemirror/state'
  import { EditorView, basicSetup } from 'codemirror'
  import { MergeView } from '@codemirror/merge'
  import { markdown } from '@codemirror/lang-markdown'
  import { javascript } from '@codemirror/lang-javascript'

  interface Props {
    language?: 'markdown' | 'javascript' | 'typescript'
    originalValue: string
    modifiedValue: string
  }

  let {
    language = 'markdown',
    originalValue = $bindable(''),
    modifiedValue = $bindable('')
  }: Props = $props()

  const cmDiffEditor = (node: HTMLDivElement) => {
    let langExtension
    if (language === 'typescript') {
      langExtension = javascript({ typescript: true })
    } else if (language === 'javascript') {
      langExtension = javascript()
    } else {
      langExtension = markdown()
    }

    const sharedExtensions = [
      basicSetup,
      langExtension,
      EditorState.readOnly.of(true),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' }
      })
    ]

    const view = new MergeView({
      a: { doc: originalValue, extensions: sharedExtensions },
      b: { doc: modifiedValue, extensions: sharedExtensions },
      parent: node
    })

    return {
      destroy: () => view.destroy()
    }
  }
</script>

<div use:cmDiffEditor class="h-full w-full diff-container"></div>
