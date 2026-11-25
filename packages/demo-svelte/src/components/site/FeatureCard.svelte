<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { tag, title, body }: { tag: string, title: string, body: string } = $props()
</script>

<article class={ui.feature}>
  {#if tag !== ''}<span class={ui.featureTag}>{tag}</span>{/if}
  <h3 class={ui.featureTitle}>{title}</h3>
  <p class={ui.featureBody}>{body}</p>
</article>
