<script lang="ts">
    import dompurify from 'dompurify'
    import { lexer, parser } from 'marked'
    import 'github-markdown-css/github-markdown-light.css'

    interface Props {
      markdown?: string
    }
    const { markdown = '' }: Props = $props()

    const html = $derived(dompurify.sanitize ? dompurify.sanitize(parser(lexer(markdown || ''))) : '')
</script>

<div class="markdown-body">
    {@html html}
</div>
