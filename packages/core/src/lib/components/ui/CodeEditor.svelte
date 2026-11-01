<script lang="ts">
  import { EditorView, basicSetup } from 'codemirror'
  import { EditorState } from '@codemirror/state'
  import { markdown } from '@codemirror/lang-markdown'
  import { javascript } from '@codemirror/lang-javascript'

  interface Props {
    language?: 'markdown' | 'javascript' | 'typescript'
    value: string
    class?: string
    onvalue?: (v: string) => void
  }

  let {
    language = 'markdown',
    value = $bindable(''),
    class: additionalClasses = '',
    onvalue = () => {}
  }: Props = $props()

  const cmEditor = (node: HTMLDivElement) => {
    let langExtension
    if (language === 'typescript') {
      langExtension = javascript({ typescript: true })
    } else if (language === 'javascript') {
      langExtension = javascript()
    } else {
      langExtension = markdown()
    }

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          langExtension,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const currentValue = update.state.doc.toString()
              value = currentValue
              onvalue(currentValue)
            }
          }),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' }
          })
        ]
      }),
      parent: node
    })

    return {
      destroy: () => view.destroy()
    }
  }
</script>

<div use:cmEditor class="h-full w-full
  [&_.cm-gutters]:bg-surface-100-900! [&_.cm-gutters]:text-surface-600-400! [&_.cm-gutters]:border-surface-200-800!
  [&_.cm-activeLine]:bg-surface-500/10! [&_.cm-activeLineGutter]:bg-surface-500/20!
  [&_.cm-cursor]:border-surface-950-50! [&_.cm-selectionBackground]:bg-primary-500/30!
  {additionalClasses}"></div>
