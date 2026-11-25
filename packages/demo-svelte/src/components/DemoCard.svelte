<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'
  /** Two text values, so a wrapper putting them in the wrong props is visible on screen. */
  const { title, body }: { title: string, body: string } = $props()
</script>

<article class={ui.demoCard}>
  <h3 class={ui.demoCardTitle}>{title}</h3>
  <p class={ui.demoCardBody}>{body}</p>
</article>
