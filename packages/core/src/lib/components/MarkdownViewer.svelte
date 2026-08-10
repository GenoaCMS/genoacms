<script lang="ts">
    import dompurify from 'dompurify'
    import { parse } from 'marked'
    import 'github-markdown-css/github-markdown-light.css'

    export let markdown = ''
    let html = ''

    $: if (dompurify.sanitize) html = dompurify.sanitize(parse(markdown || ''))
</script>

<div class="markdown-body">
    {@html html}
</div>
