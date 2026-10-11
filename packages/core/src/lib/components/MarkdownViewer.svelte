<script lang="ts">
    import { onMount } from 'svelte'
    import dompurify from 'dompurify'
    import { lexer, parser } from 'marked'
    import 'github-markdown-css/github-markdown-light.css'

    interface Props {
      markdown?: string
    }
    const { markdown = '' }: Props = $props()

    const html = $derived(dompurify.sanitize ? dompurify.sanitize(parser(lexer(markdown || ''))) : '')

    let isMounted = $state(false)
    onMount(() => { isMounted = true })
</script>

<!-- EDT-10, OF16 -->
<div class="markdown-body">
    {#if isMounted}{@html html}{/if}
</div>
